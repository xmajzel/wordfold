-- Preserve prior spending while increasing both one-time grants by 50%.
begin;

alter table public.ai_credit_accounts alter column balance set default 15;

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_kind_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_kind_check
  check (kind in ('welcome', 'paid', 'welcome_increase', 'paid_increase', 'reserve', 'refund'));
create unique index ai_credit_increase_once on public.ai_credit_ledger(user_id,kind)
  where kind in ('welcome_increase', 'paid_increase');

with increases as (
  insert into public.ai_credit_ledger(user_id,kind,amount)
    select user_id,'welcome_increase',5 from public.ai_credit_ledger where kind='welcome'
    on conflict do nothing returning user_id
)
update public.ai_credit_accounts as account set balance=account.balance+5
  from increases where account.user_id=increases.user_id;

with increases as (
  insert into public.ai_credit_ledger(user_id,kind,amount)
    select user_id,'paid_increase',20 from public.ai_credit_ledger where kind='paid'
    on conflict do nothing returning user_id
)
update public.ai_credit_accounts as account set balance=account.balance+20
  from increases where account.user_id=increases.user_id;

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
    'paidGrant',exists(select 1 from public.ai_credit_ledger where user_id=p_user_id and kind='paid'));
end $$;

create or replace function public.ai_grant_paid(p_user_id uuid,p_purchase_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_count integer;
begin
  perform public.ai_account(p_user_id);
  insert into public.ai_purchase_claims(purchase_hash,user_id) values(p_purchase_hash,p_user_id) on conflict do nothing;
  select user_id into v_owner from public.ai_purchase_claims where purchase_hash=p_purchase_hash;
  if v_owner is distinct from p_user_id then return public.ai_account(p_user_id) || '{"purchaseClaimedElsewhere":true}'::jsonb; end if;
  insert into public.ai_credit_ledger(user_id,kind,amount) values(p_user_id,'paid',60) on conflict do nothing;
  get diagnostics v_count = row_count;
  if v_count=1 then update public.ai_credit_accounts set balance=balance+60 where user_id=p_user_id; end if;
  return public.ai_account(p_user_id);
end $$;

commit;
