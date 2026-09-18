-- Credits are server-owned; reservations and results commit together under a wallet lock.
create table public.ai_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revenuecat_id uuid not null unique default gen_random_uuid(),
  balance integer not null default 10 check (balance >= 0),
  created_at timestamptz not null default now()
);
create table public.ai_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.ai_credit_accounts(user_id) on delete cascade,
  kind text not null check (kind in ('welcome', 'paid', 'reserve', 'refund')),
  amount integer not null,
  request_id uuid,
  created_at timestamptz not null default now()
);
create unique index ai_credit_grant_once on public.ai_credit_ledger(user_id,kind) where kind in ('welcome','paid');
create unique index ai_credit_request_once on public.ai_credit_ledger(user_id,request_id,kind) where request_id is not null;
-- Retain only a one-way purchase fingerprint after account deletion to prevent re-granting.
create table public.ai_purchase_claims (
  purchase_hash text primary key check (purchase_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.ai_word_requests (
  user_id uuid not null references public.ai_credit_accounts(user_id) on delete cascade,
  request_id uuid not null,
  input jsonb not null,
  status text not null check (status in ('pending','completed','failed')),
  result jsonb,
  usage jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  primary key(user_id,request_id)
);
create index ai_word_requests_created on public.ai_word_requests(created_at);
alter table public.ai_credit_accounts enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.ai_purchase_claims enable row level security;
alter table public.ai_word_requests enable row level security;
revoke all on public.ai_credit_accounts,public.ai_credit_ledger,public.ai_purchase_claims,public.ai_word_requests from anon, authenticated;
grant select on public.ai_credit_accounts,public.ai_credit_ledger to authenticated;
create policy ai_own_balance on public.ai_credit_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_own_ledger on public.ai_credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
grant all on public.ai_credit_accounts,public.ai_credit_ledger,public.ai_purchase_claims,public.ai_word_requests to service_role;
grant usage, select on sequence public.ai_credit_ledger_id_seq to service_role;

create function public.ai_account(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.ai_credit_accounts; v_count integer;
begin
  insert into public.ai_credit_accounts(user_id) values(p_user_id) on conflict do nothing;
  insert into public.ai_credit_ledger(user_id,kind,amount) values(p_user_id,'welcome',10) on conflict do nothing;
  select * into v_row from public.ai_credit_accounts where user_id=p_user_id for update;
  with expired as (
    update public.ai_word_requests set status='failed'
      where user_id=p_user_id and status='pending' and expires_at <= now() returning request_id
  ) insert into public.ai_credit_ledger(user_id,kind,amount,request_id)
    select p_user_id,'refund',1,request_id from expired on conflict do nothing;
  get diagnostics v_count = row_count;
  update public.ai_credit_accounts set balance=balance+v_count where user_id=p_user_id returning * into v_row;
  return jsonb_build_object('balance',v_row.balance,'revenuecatId',v_row.revenuecat_id,
    'paidGrant',exists(select 1 from public.ai_credit_ledger where user_id=p_user_id and kind='paid'));
end $$;

create function public.ai_grant_paid(p_user_id uuid,p_purchase_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_count integer;
begin
  perform public.ai_account(p_user_id);
  insert into public.ai_purchase_claims(purchase_hash,user_id) values(p_purchase_hash,p_user_id) on conflict do nothing;
  select user_id into v_owner from public.ai_purchase_claims where purchase_hash=p_purchase_hash;
  if v_owner is distinct from p_user_id then return public.ai_account(p_user_id) || '{"purchaseClaimedElsewhere":true}'::jsonb; end if;
  insert into public.ai_credit_ledger(user_id,kind,amount) values(p_user_id,'paid',40) on conflict do nothing;
  get diagnostics v_count = row_count;
  if v_count=1 then update public.ai_credit_accounts set balance=balance+40 where user_id=p_user_id; end if;
  return public.ai_account(p_user_id);
end $$;

create function public.ai_reserve(p_user_id uuid,p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_account jsonb; v_request public.ai_word_requests;
begin
  -- Serialize the global request-limit check across wallets, as well as each wallet's spending.
  perform pg_advisory_xact_lock(1860918);
  v_account := public.ai_account(p_user_id);
  select * into v_request from public.ai_word_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_request.input <> p_input then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status',v_request.status,'suggestion',v_request.result,'balance',v_account->'balance');
  end if;
  if (v_account->>'balance')::integer < 1 then return jsonb_build_object('status','empty','balance',0); end if;
  if (select count(*) from public.ai_word_requests where user_id=p_user_id and created_at>now()-interval '1 hour') >= 30
    or (select count(*) from public.ai_word_requests where created_at>now()-interval '1 day') >= 2000 then
    return jsonb_build_object('status','limited');
  end if;
  insert into public.ai_word_requests(user_id,request_id,input,status) values(p_user_id,p_request_id,p_input,'pending');
  update public.ai_credit_accounts set balance=balance-1 where user_id=p_user_id;
  insert into public.ai_credit_ledger(user_id,kind,amount,request_id) values(p_user_id,'reserve',-1,p_request_id);
  return jsonb_build_object('status','reserved','balance',(v_account->>'balance')::integer-1);
end $$;

create function public.ai_finish(p_user_id uuid,p_request_id uuid,p_result jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_account jsonb; v_request public.ai_word_requests;
begin
  v_account := public.ai_account(p_user_id);
  select * into v_request from public.ai_word_requests where user_id=p_user_id and request_id=p_request_id for update;
  if not found then return jsonb_build_object('status','failed','balance',v_account->'balance'); end if;
  if v_request.status='pending' then
    update public.ai_word_requests set status=case when p_result is null then 'failed' else 'completed' end,
      result=p_result,usage=p_usage where user_id=p_user_id and request_id=p_request_id;
    if p_result is null then
      update public.ai_credit_accounts set balance=balance+1 where user_id=p_user_id;
      insert into public.ai_credit_ledger(user_id,kind,amount,request_id) values(p_user_id,'refund',1,p_request_id);
    end if;
  end if;
  select * into v_request from public.ai_word_requests where user_id=p_user_id and request_id=p_request_id;
  return jsonb_build_object('status',v_request.status,'suggestion',v_request.result,'balance',
    (select balance from public.ai_credit_accounts where user_id=p_user_id));
end $$;
revoke all on function public.ai_account(uuid), public.ai_grant_paid(uuid,text), public.ai_reserve(uuid,uuid,jsonb), public.ai_finish(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ai_account(uuid), public.ai_grant_paid(uuid,text), public.ai_reserve(uuid,uuid,jsonb), public.ai_finish(uuid,uuid,jsonb,jsonb) to service_role;
