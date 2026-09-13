begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('public', 'app_release_policies', 'release policies exist');
select ok((select relrowsecurity from pg_class where oid = 'public.app_release_policies'::regclass), 'RLS is enabled');
select ok(has_table_privilege('anon', 'public.app_release_policies', 'SELECT'), 'guests can read');
select ok(has_table_privilege('authenticated', 'public.app_release_policies', 'SELECT'), 'signed-in users can read');
select ok(not has_table_privilege('anon', 'public.app_release_policies', 'INSERT, UPDATE, DELETE'), 'guests cannot change policy');
select ok(not has_table_privilege('authenticated', 'public.app_release_policies', 'INSERT, UPDATE, DELETE'), 'users cannot change policy');

insert into public.app_release_policies values
  ('test.wordfold', 'android', 'preview', 8, 5, 'Test release', 'https://play.google.com/store/apps/details?id=test.wordfold');
set local role anon;
select is((select latest_build from public.app_release_policies where application_id = 'test.wordfold'), 8, 'guest reads through RLS');
reset role;
set local role authenticated;
select is((select minimum_supported_build from public.app_release_policies where application_id = 'test.wordfold'), 5, 'signed-in user reads through RLS');
reset role;
select throws_ok(
  $$update public.app_release_policies set minimum_supported_build = 9 where application_id = 'test.wordfold'$$,
  '23514', null, 'minimum cannot exceed latest'
);
select throws_ok(
  $$update public.app_release_policies set latest_build = 0 where application_id = 'test.wordfold'$$,
  '23514', null, 'builds must be positive'
);
select * from finish();
rollback;
