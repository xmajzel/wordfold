begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok(not has_table_privilege('anon', 'public.feedback_reports', 'SELECT'), 'Guests cannot read reports');
select ok(not has_table_privilege('authenticated', 'public.feedback_reports', 'SELECT'), 'Signed-in users cannot read reports');
select ok(not has_table_privilege('anon', 'public.feedback_reports', 'INSERT'), 'Guests cannot bypass validation');
select ok(not has_function_privilege('anon', 'public.accept_feedback(jsonb,text)', 'EXECUTE'), 'Guests cannot bypass quotas through RPC');
select ok(not has_function_privilege('authenticated', 'public.claim_feedback_emails()', 'EXECUTE'), 'Users cannot claim notifications');
select ok((select relrowsecurity from pg_class where oid = 'public.feedback_reports'::regclass), 'Reports have RLS enabled');

select is(public.accept_feedback('{"id":"11111111-1111-4111-8111-111111111111","installationId":"22222222-2222-4222-8222-222222222222","category":"bug","message":"Card flickers","contactEmail":""}', 'test-network'), 'accepted', 'A report can be stored');
select is(public.accept_feedback('{"id":"11111111-1111-4111-8111-111111111111","installationId":"22222222-2222-4222-8222-222222222222","category":"bug","message":"Card flickers","contactEmail":""}', 'different-network'), 'accepted', 'Retry after a lost acknowledgement is accepted');
select is((select count(*)::integer from feedback_reports where id = '11111111-1111-4111-8111-111111111111'), 1, 'Retry creates no duplicate');
select is(public.accept_feedback('{"id":"11111111-1111-4111-8111-111111111111","installationId":"22222222-2222-4222-8222-222222222222","category":"bug","message":"Overwritten","contactEmail":""}', 'test-network'), 'conflict', 'An existing report cannot be overwritten');

create temporary table claimed as select * from public.claim_feedback_emails();
select is((select count(*)::integer from claimed), 1, 'Worker claims the pending report');
select is((select count(*)::integer from public.claim_feedback_emails()), 0, 'Concurrent worker cannot reclaim a live lease');
update feedback_reports set email_next_attempt_at = now() - interval '1 minute';
select is((select count(*)::integer from public.claim_feedback_emails()), 1, 'Crashed worker lease can be reclaimed');
select isnt((select email_lease from feedback_reports where id = '11111111-1111-4111-8111-111111111111'), (select email_lease from claimed), 'Retry uses a new lease');
update feedback_reports set email_first_attempt_at = now() - interval '24 hours', email_next_attempt_at = now() - interval '1 minute';
select is((select count(*)::integer from public.claim_feedback_emails()), 0, 'Ambiguous sends stop before provider deduplication expires');
select is((select email_status from feedback_reports where id = '11111111-1111-4111-8111-111111111111'), 'failed', 'Expired retries are visible for manual review');
select is((select message from feedback_reports where id = '11111111-1111-4111-8111-111111111111'), 'Card flickers', 'Email failure preserves the original report');

do $$ begin
  for i in 1..19 loop
    perform public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', '22222222-2222-4222-8222-222222222222', 'category', 'bug', 'message', 'Test quota', 'contactEmail', ''), 'test-network');
  end loop;
end $$;
select is(public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', '22222222-2222-4222-8222-222222222222', 'category', 'bug', 'message', 'Beyond quota', 'contactEmail', ''), 'test-network'), 'limited', 'Installation quota is enforced');
select is(public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', gen_random_uuid(), 'category', 'idea', 'message', 'Different installation', 'contactEmail', ''), 'test-network'), 'accepted', 'Another installation can still submit');

do $$ begin
  for i in 1..29 loop
    perform public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', gen_random_uuid(), 'category', 'bug', 'message', 'Network quota', 'contactEmail', ''), 'test-network');
  end loop;
end $$;
select is(public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', gen_random_uuid(), 'category', 'bug', 'message', 'Beyond network quota', 'contactEmail', ''), 'test-network'), 'limited', 'Network quota also covers rotated installation IDs');
do $$ begin
  for i in 1..150 loop
    perform public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', gen_random_uuid(), 'category', 'bug', 'message', 'Global quota', 'contactEmail', ''), 'network-' || i);
  end loop;
end $$;
select is(public.accept_feedback(jsonb_build_object('id', gen_random_uuid(), 'installationId', gen_random_uuid(), 'category', 'bug', 'message', 'Beyond global quota', 'contactEmail', ''), 'new-network'), 'limited', 'Global quota limits distributed abuse');

select * from finish();
rollback;
