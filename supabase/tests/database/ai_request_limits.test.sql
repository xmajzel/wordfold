begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.ai_account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
update public.ai_credit_accounts set balance=1000 where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Failed attempts still count; attempts exactly one hour old have left the rolling window.
insert into public.ai_word_requests(user_id,request_id,input,status,created_at)
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'{}','failed',now() from generate_series(1,299);
insert into public.ai_word_requests(user_id,request_id,input,status,created_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'{}','failed',now()-interval '1 hour');
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{}')->>'status','reserved','300th hourly attempt succeeds, excluding the expired window boundary');
select is((public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'balance')::integer,999,'allowed hourly attempt spends one credit');
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','{}')->>'status','limited','301st hourly attempt is limited, including failed attempts');
select is((public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'balance')::integer,999,'hourly rejection spends no credit');
select is((select count(*)::integer from public.ai_word_requests where request_id='22222222-2222-4222-8222-222222222222'),0,'hourly rejection creates no request');
select is((select count(*)::integer from public.ai_credit_ledger where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='reserve'),1,'hourly rejection creates no spending entry');
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{}')->>'status','pending','same request can be recovered at the hourly limit');
select is((public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'balance')::integer,999,'hourly retry does not charge again');
select is(public.ai_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','{}')->>'status','reserved','hourly limit does not block another account');
update public.ai_word_requests set created_at=now()-interval '1 hour'
  where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status='failed';
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','{}')->>'status','reserved','a previously rejected attempt succeeds when hourly history expires');

-- Isolate the global window from the per-account hour using two-hour-old history.
delete from public.ai_word_requests where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.ai_word_requests(user_id,request_id,input,status,created_at)
  select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid(),'{}','failed',now()-interval '2 hours' from generate_series(1,4999);
insert into public.ai_word_requests(user_id,request_id,input,status,created_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid(),'{}','failed',now()-interval '1 day');
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','{}')->>'status','reserved','5000th daily attempt succeeds, excluding the expired window boundary');
select is((public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'balance')::integer,997,'allowed daily attempt spends one credit');
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','{}')->>'status','limited','5001st daily attempt is limited across accounts, including failed attempts');
select is((public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'balance')::integer,997,'global rejection spends no credit');
select is((select count(*)::integer from public.ai_word_requests where request_id='55555555-5555-4555-8555-555555555555'),0,'global rejection creates no request');
select is((select count(*)::integer from public.ai_credit_ledger where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='reserve'),3,'global rejection creates no spending entry');
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','{}')->>'status','pending','same request can be recovered at the global limit');
select is((public.ai_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'balance')::integer,997,'global retry does not charge again');
update public.ai_word_requests set created_at=now()-interval '1 day'
  where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    and request_id=(select request_id from public.ai_word_requests where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and created_at>now()-interval '1 day' limit 1);
select is(public.ai_reserve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','{}')->>'status','reserved','a previously rejected attempt succeeds when daily history expires');
select ok(not has_function_privilege('authenticated','public.ai_reserve(uuid,uuid,jsonb)','EXECUTE'),'clients still cannot reserve credits directly');
select * from finish();
rollback;
