begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id) values ('98765432-1111-4111-8111-123456789012');
insert into public.collections(id, user_id, name, color) values
('98765432-2222-4222-8222-123456789012','98765432-1111-4111-8111-123456789012','Play test','#6657D9');
insert into public.words(id, user_id, collection_id, term, normalized_term, definition, state, known_streak, view_count, lapse_count) values
('98765432-3333-4333-8333-123456789012','98765432-1111-4111-8111-123456789012','98765432-2222-4222-8222-123456789012','hello','hello','A greeting','learned',3,5,2);
select set_config('request.jwt.claim.sub', '98765432-1111-4111-8111-123456789012', true);
set local role authenticated;
insert into public.learning_events(id,user_id,word_id,type,value,occurred_at) values
('98765432-4444-4444-8444-123456789011','98765432-1111-4111-8111-123456789012','98765432-3333-4333-8333-123456789012','game_seen','{"sessionId":"test","mode":"matching"}','2026-09-18');
select is((select state from words where id = '98765432-3333-4333-8333-123456789012'), 'learned', 'playing does not change learning state');
select public.relearn_game_word('98765432-3333-4333-8333-123456789012','98765432-4444-4444-8444-123456789012','{"sessionId":"test","mode":"matching"}','2026-09-18');
select is((select state from words where id = '98765432-3333-4333-8333-123456789012'), 'cannot_remember', 'selected word returns to practice');
select is((select next_review_at from words where id = '98765432-3333-4333-8333-123456789012'), '2026-09-18'::timestamptz, 'selected word is immediately due');
select is((select known_streak from words where id = '98765432-3333-4333-8333-123456789012'), 0, 'relearning resets confirmations');
select is((select view_count from words where id = '98765432-3333-4333-8333-123456789012'), 5, 'regular views are preserved');
select is((select lapse_count from words where id = '98765432-3333-4333-8333-123456789012'), 2, 'regular misses are preserved');
update words set state = 'understood', known_streak = 1, last_rated_at = '2026-09-19' where id = '98765432-3333-4333-8333-123456789012';
select public.relearn_game_word('98765432-3333-4333-8333-123456789012','98765432-4444-4444-8444-123456789012','{"sessionId":"test","mode":"matching"}','2026-09-18');
select is((select known_streak from words where id = '98765432-3333-4333-8333-123456789012'), 1, 'upload retry preserves later progress');
select is((select count(*)::integer from learning_events where type = 'game_relearned'), 1, 'upload retry records no duplicate');
update words set state = 'learned', known_streak = 3 where id = '98765432-3333-4333-8333-123456789012';
select public.relearn_game_word('98765432-3333-4333-8333-123456789012','98765432-4444-4444-8444-123456789013','{"sessionId":"offline","mode":"recall"}','2026-09-18');
select is((select state from words where id = '98765432-3333-4333-8333-123456789012'), 'learned', 'stale offline restart respects later learning on another device');
select set_config('request.jwt.claim.sub', '98765432-1111-4111-8111-123456789099', true);
select throws_ok($$select public.relearn_game_word('98765432-3333-4333-8333-123456789012','98765432-4444-4444-8444-123456789014','{}','2026-09-19')$$, '42501', 'word not found', 'other accounts cannot restart this word');
select ok(not has_function_privilege('anon', 'public.relearn_game_word(uuid,uuid,text,timestamptz)', 'EXECUTE'), 'anonymous clients cannot restart words');
select * from finish();
rollback;
