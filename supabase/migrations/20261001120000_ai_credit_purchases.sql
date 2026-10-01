begin;

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_kind_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_kind_check
  check (kind in ('welcome', 'paid', 'welcome_increase', 'paid_increase', 'reserve', 'refund', 'purchase', 'purchase_refund'));

-- Only fingerprints survive account deletion. Store receipts and payment details are never stored.
create table public.ai_credit_purchases (
  purchase_hash text primary key check (purchase_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('credited', 'refunded')),
  created_at timestamptz not null default now()
);
alter table public.ai_credit_purchases enable row level security;
revoke all on public.ai_credit_purchases from anon, authenticated;
grant all on public.ai_credit_purchases to service_role;
create index ai_credit_pack_ledger_user on public.ai_credit_ledger(user_id) where kind='purchase';

create or replace function public.ai_account(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.ai_credit_accounts; v_count integer;
begin
  insert into public.ai_credit_accounts(user_id) values(p_user_id) on conflict do nothing;
  insert into public.ai_credit_ledger(user_id,kind,amount) values(p_user_id,'welcome',15) on conflict do nothing;
  select * into v_row from public.ai_credit_accounts where user_id=p_user_id for update;
  with expired as (
    update public.ai_word_requests set status='failed'
      where user_id=p_user_id and status='pending' and expires_at <= now() returning request_id
  ) insert into public.ai_credit_ledger(user_id,kind,amount,request_id)
    select p_user_id,'refund',1,request_id from expired on conflict do nothing;
  get diagnostics v_count = row_count;
  update public.ai_credit_accounts set balance=balance+v_count where user_id=p_user_id returning * into v_row;
  return jsonb_build_object('balance',v_row.balance,'revenuecatId',v_row.revenuecat_id,
    'paidGrant',exists(select 1 from public.ai_credit_ledger where user_id=p_user_id and kind='paid'),
    'creditPackCount',(select count(*) from public.ai_credit_ledger where user_id=p_user_id and kind='purchase'));
end $$;

create function public.ai_apply_credit_purchase(p_revenuecat_ids uuid[], p_purchase_hash text, p_refunded boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_purchase public.ai_credit_purchases; v_user uuid; v_candidates integer; v_balance integer; v_amount integer;
begin
  if p_purchase_hash is null or p_purchase_hash !~ '^[a-f0-9]{64}$' or p_refunded is null then
    raise exception 'Invalid credit purchase';
  end if;
  -- Serialize both delivery retries and purchase/refund events that arrive out of order.
  perform pg_advisory_xact_lock(hashtextextended(p_purchase_hash, 0));
  select * into v_purchase from public.ai_credit_purchases where purchase_hash=p_purchase_hash;
  if found then
    if v_purchase.status='refunded' or not p_refunded then return jsonb_build_object('status',v_purchase.status); end if;
    if v_purchase.user_id is not null then
      select balance into v_balance from public.ai_credit_accounts where user_id=v_purchase.user_id for update;
      v_amount := least(coalesce(v_balance,0),100);
      update public.ai_credit_accounts set balance=balance-v_amount where user_id=v_purchase.user_id;
      insert into public.ai_credit_ledger(user_id,kind,amount) values(v_purchase.user_id,'purchase_refund',-v_amount);
    end if;
    update public.ai_credit_purchases set status='refunded' where purchase_hash=p_purchase_hash;
    return jsonb_build_object('status','refunded');
  end if;
  if p_refunded then
    insert into public.ai_credit_purchases(purchase_hash,status) values(p_purchase_hash,'refunded');
    return jsonb_build_object('status','refunded');
  end if;
  select user_id into v_user from public.ai_credit_accounts where revenuecat_id=p_revenuecat_ids[1];
  if v_user is null then
    select count(*) into v_candidates from public.ai_credit_accounts where revenuecat_id=any(p_revenuecat_ids);
    if v_candidates <> 1 then return jsonb_build_object('status','unmapped'); end if;
    select user_id into v_user from public.ai_credit_accounts where revenuecat_id=any(p_revenuecat_ids);
  end if;
  -- Use the same wallet lock as generation. A repeated or transferred receipt cannot grant again.
  perform public.ai_account(v_user);
  insert into public.ai_credit_purchases(purchase_hash,user_id,status) values(p_purchase_hash,v_user,'credited');
  update public.ai_credit_accounts set balance=balance+100 where user_id=v_user;
  insert into public.ai_credit_ledger(user_id,kind,amount) values(v_user,'purchase',100);
  return jsonb_build_object('status','credited');
end $$;

create function public.ai_credit_purchase_status(p_user_id uuid,p_purchase_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_account jsonb; v_status text;
begin
  v_account := public.ai_account(p_user_id);
  select status into v_status from public.ai_credit_purchases where purchase_hash=p_purchase_hash and user_id=p_user_id;
  return v_account || jsonb_build_object('creditPurchaseStatus',coalesce(v_status,'pending'));
end $$;

revoke all on function public.ai_apply_credit_purchase(uuid[],text,boolean), public.ai_credit_purchase_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ai_apply_credit_purchase(uuid[],text,boolean), public.ai_credit_purchase_status(uuid,text) to service_role;

commit;
