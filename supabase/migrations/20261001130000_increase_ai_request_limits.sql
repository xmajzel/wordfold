-- Allow longer learning sessions while retaining per-account and global spending limits.
create or replace function public.ai_reserve(p_user_id uuid,p_request_id uuid,p_input jsonb) returns jsonb
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
  if (select count(*) from public.ai_word_requests where user_id=p_user_id and created_at>now()-interval '1 hour') >= 300
    or (select count(*) from public.ai_word_requests where created_at>now()-interval '1 day') >= 5000 then
    return jsonb_build_object('status','limited');
  end if;
  insert into public.ai_word_requests(user_id,request_id,input,status) values(p_user_id,p_request_id,p_input,'pending');
  update public.ai_credit_accounts set balance=balance-1 where user_id=p_user_id;
  insert into public.ai_credit_ledger(user_id,kind,amount,request_id) values(p_user_id,'reserve',-1,p_request_id);
  return jsonb_build_object('status','reserved','balance',(v_account->>'balance')::integer-1);
end $$;
