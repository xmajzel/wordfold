begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id) values ('12345678-1111-4111-8111-123456789012'), ('12345678-1111-4111-8111-123456789013');
insert into public.collections(id, user_id, name, color) values
('12345678-2222-4222-8222-123456789012','12345678-1111-4111-8111-123456789012','Test','#6657D9');
insert into public.words(id, user_id, collection_id, term, normalized_term, definition) values
('12345678-3333-4333-8333-123456789012','12345678-1111-4111-8111-123456789012','12345678-2222-4222-8222-123456789012','hello','hello','A greeting');
select set_config('request.jwt.claim.sub', '12345678-1111-4111-8111-123456789012', true);
set local role authenticated;
select public.apply_word_rating_v3('12345678-3333-4333-8333-123456789012','12345678-4444-4444-8444-123456789011','understood','understood',1,0,'2026-08-10 23:30Z','2026-08-13',0,'2026-08-11');
select is((select practice_date from learning_events where id = '12345678-4444-4444-8444-123456789011'), '2026-08-11'::date, 'rating saves original local date atomically');
select public.apply_word_rating_v3('12345678-3333-4333-8333-123456789012','12345678-4444-4444-8444-123456789011','understood','understood',1,0,'2026-08-10 23:30Z','2026-08-13',0,'2026-08-10');
select is((select practice_date from learning_events where id = '12345678-4444-4444-8444-123456789011'), '2026-08-11'::date, 'retry in another timezone keeps first date');
select is((select count(*)::integer from learning_events), 1, 'rating retry creates one event');
select public.apply_word_rating_v3('12345678-3333-4333-8333-123456789012','12345678-4444-4444-8444-123456789012','understood','understood',1,0,'2026-08-01','2026-08-13',0,'2026-08-01');
select is((select practice_date from learning_events where id = '12345678-4444-4444-8444-123456789012'),'2026-08-01'::date,'stale offline ratings retain deliberate practice');
select is((select last_rated_at from words where id = '12345678-3333-4333-8333-123456789012'),'2026-08-10 23:30Z'::timestamptz,'stale practice cannot regress word progress');

select throws_ok($$insert into learning_events(id,user_id,type,value,occurred_at,practice_date)
values (md5('wordfold:garden:12345678-1111-4111-8111-123456789012:1')::uuid,'12345678-1111-4111-8111-123456789012','garden_tree','1','2026-08-11','2026-08-11')$$,
'22023','garden milestone not earned','fewer than ten dates cannot claim a tree');
insert into learning_events(id,user_id,word_id,type,value,occurred_at)
select gen_random_uuid(),'12345678-1111-4111-8111-123456789012','12345678-3333-4333-8333-123456789012','game_answered','{}', ('2026-08-01'::date + day)::timestamptz
from generate_series(0,8) day;
select is((select count(distinct practice_date)::integer from learning_events), 10, 'old clients receive stable UTC practice dates');
insert into learning_events(id,user_id,type,value,occurred_at,practice_date)
values (md5('wordfold:garden:12345678-1111-4111-8111-123456789012:1')::uuid,'12345678-1111-4111-8111-123456789012','garden_tree','1','2026-08-12','2026-08-11');
insert into learning_events(id,user_id,type,value,occurred_at,practice_date)
values (md5('wordfold:garden:12345678-1111-4111-8111-123456789012:1')::uuid,'12345678-1111-4111-8111-123456789012','garden_tree','1','2026-08-13','2026-08-11') on conflict(id) do nothing;
select is((select count(*)::integer from learning_events where type = 'garden_tree'),1,'two devices claim the same tree once');
select is((select occurred_at from learning_events where type = 'garden_tree'),'2026-08-12'::timestamptz,'retry preserves first planting timestamp');
insert into learning_events(id,user_id,type,occurred_at) values
(gen_random_uuid(),'12345678-1111-4111-8111-123456789012','view','2026-08-15'),
(gen_random_uuid(),'12345678-1111-4111-8111-123456789012','game_seen','2026-08-16');
select is((select count(distinct practice_date)::integer from learning_events where type in ('rating','game_missed','game_answered')),10,'passive views do not grow the garden');
select throws_ok($$insert into learning_events(id,user_id,type,value,occurred_at,practice_date)
values (md5('wordfold:garden:12345678-1111-4111-8111-123456789012:2')::uuid,'12345678-1111-4111-8111-123456789012','garden_tree','2','2026-08-20','2026-08-20')$$,
'22023','garden milestone not earned','each additional tree needs ten more distinct dates');
reset role;
delete from words where id = '12345678-3333-4333-8333-123456789012';
select is((select count(distinct practice_date)::integer from learning_events where type in ('rating','game_missed','game_answered')),10,'physical word deletion retains practice history');
select is((select count(*)::integer from learning_events where word_id is not null),0,'deleted vocabulary references become null');
set local role authenticated;
select public.apply_word_rating_v3('12345678-3333-4333-8333-123456789012','12345678-4444-4444-8444-123456789099','understood','understood',1,0,'2026-08-20','2026-08-23',0,'2026-08-20');
select is((select practice_date from learning_events where id = '12345678-4444-4444-8444-123456789099'),'2026-08-20'::date,'practice uploaded after remote deletion is retained without recreating a word');
reset role;

select set_config('request.jwt.claim.sub', '12345678-1111-4111-8111-123456789013', true);
set local role authenticated;
select is((select count(*)::integer from learning_events),0,'another account cannot read the garden');
select ok(not has_function_privilege('anon','public.apply_word_rating_v3(uuid,uuid,text,text,integer,integer,timestamptz,timestamptz,integer,date)','EXECUTE'),'anonymous clients cannot rate words');
select * from finish();
rollback;
