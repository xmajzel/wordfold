begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('public', 'collections', 'collections table exists');
select has_table('public', 'words', 'words table exists');
select has_table('public', 'learning_events', 'learning_events table exists');

select col_is_pk('public', 'collections', 'id', 'collections uses id as its primary key');
select col_is_pk('public', 'words', 'id', 'words uses id as its primary key');
select col_is_pk('public', 'learning_events', 'id', 'learning_events uses id as its primary key');

select has_index(
  'public',
  'words',
  'words_user_normalized_term_active_idx',
  'active normalized terms have a per-user unique index'
);
select has_index(
  'public',
  'words',
  'words_user_state_due_idx',
  'word review lookups have an index'
);
select has_index(
  'public',
  'learning_events',
  'learning_events_user_time_idx',
  'learning event history has an index'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.collections'::regclass),
  'collections has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.words'::regclass),
  'words has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.learning_events'::regclass),
  'learning_events has RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.collections', 'SELECT, INSERT, UPDATE'),
  'authenticated users can read and mutate owned collections'
);
select ok(
  not has_table_privilege('authenticated', 'public.collections', 'DELETE'),
  'authenticated users cannot physically delete collections'
);
select ok(
  has_table_privilege('authenticated', 'public.words', 'SELECT, INSERT, UPDATE'),
  'authenticated users can read and mutate owned words'
);
select ok(
  not has_table_privilege('authenticated', 'public.words', 'DELETE'),
  'authenticated users cannot physically delete words'
);
select ok(
  has_table_privilege('authenticated', 'public.learning_events', 'SELECT, INSERT'),
  'authenticated users can read and append owned learning events'
);
select ok(
  not has_table_privilege('authenticated', 'public.learning_events', 'UPDATE, DELETE'),
  'authenticated users cannot alter learning event history'
);

select is(
  (select count(*) from pg_publication_tables where pubname = 'powersync'),
  3::bigint,
  'the PowerSync publication contains three tables'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'powersync' and schemaname = 'public' and tablename = 'collections'
  ),
  'the PowerSync publication contains collections'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'powersync' and schemaname = 'public' and tablename = 'words'
  ),
  'the PowerSync publication contains words'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'powersync' and schemaname = 'public' and tablename = 'learning_events'
  ),
  'the PowerSync publication contains learning_events'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'sync-user-1@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'sync-user-2@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'sync-user-3@example.test');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.collections (id, user_id, name, color, created_at)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'My words',
    '#4F4DBB',
    '2026-01-01T10:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'Empty collection',
    '#4F4DBB',
    '2026-01-01T10:00:00Z'
  );

insert into public.words (
  id,
  user_id,
  collection_id,
  term,
  normalized_term,
  definition,
  created_at
)
values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Scope',
  'scope',
  'The extent of something.',
  '2026-01-01T10:00:00Z'
);

select is(
  (select count(*) from public.words),
  1::bigint,
  'the owner can read their word'
);

select throws_ok(
  $$
    insert into public.words (
      id, user_id, collection_id, term, normalized_term, definition
    ) values (
      '20000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'scope',
      'scope',
      'Duplicate active word.'
    )
  $$,
  '23505',
  null,
  'active normalized terms are unique for one user'
);

select is(
  (public.apply_word_rating(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'understood',
    'understood',
    1,
    0,
    '2026-01-02T10:00:00Z',
    '2026-01-03T10:00:00Z'
  )).state,
  'understood',
  'rating updates the word atomically'
);

select is(
  (select count(*) from public.learning_events where type = 'rating'),
  1::bigint,
  'rating appends one event'
);

select is(
  (public.apply_word_rating(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'again',
    'cannot_remember',
    0,
    1,
    '2026-01-04T10:00:00Z',
    '2026-01-04T11:00:00Z'
  )).state,
  'understood',
  'replaying a rating event does not mutate the word twice'
);

select is(
  (public.record_word_view(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '2026-01-02T11:00:00Z'
  )).view_count,
  1,
  'view recording increments the counter'
);

select is(
  (public.record_word_view(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '2026-01-02T11:00:00Z'
  )).view_count,
  1,
  'replaying a view event does not increment twice'
);

select throws_ok(
  $$update public.learning_events set value = 'again'$$,
  '42501',
  null,
  'learning events are append-only'
);

select throws_ok(
  $$delete from public.words where id = '20000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated users cannot physically delete words'
);

select throws_ok(
  $$
    update public.words
    set id = '20000000-0000-4000-8000-000000000099'
    where id = '20000000-0000-4000-8000-000000000001'
  $$,
  '22000',
  'id is immutable',
  'synchronized row IDs are immutable'
);

select throws_ok(
  $$select public.tombstone_collection('10000000-0000-4000-8000-000000000001')$$,
  '23514',
  'collection contains active words',
  'a collection with active words cannot be tombstoned'
);

select ok(
  (public.tombstone_word('20000000-0000-4000-8000-000000000001')).deleted_at is not null,
  'word deletion creates a tombstone'
);

select ok(
  (public.tombstone_word('20000000-0000-4000-8000-000000000001')).deleted_at is not null,
  'replaying word deletion is idempotent'
);

select throws_ok(
  $$
    update public.words
    set term = 'Changed after deletion'
    where id = '20000000-0000-4000-8000-000000000001'
  $$,
  '22000',
  'tombstoned rows cannot be changed',
  'a tombstoned word cannot be edited'
);

insert into public.words (
  id,
  user_id,
  collection_id,
  term,
  normalized_term,
  definition
)
values (
  '20000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Scope',
  'scope',
  'A replacement for a tombstoned word.'
);

select pass('a normalized term can be reused after its previous word is tombstoned');

select ok(
  (public.tombstone_word('20000000-0000-4000-8000-000000000003')).deleted_at is not null,
  'the replacement word can be tombstoned'
);

select ok(
  (public.tombstone_collection('10000000-0000-4000-8000-000000000001')).deleted_at is not null,
  'a collection without active words can be tombstoned'
);

select ok(
  (public.tombstone_collection('10000000-0000-4000-8000-000000000003')).deleted_at is not null,
  'an empty collection can be tombstoned'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

insert into public.collections (id, user_id, name, color)
values (
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  'Second user',
  '#27A8A2'
);

select is(
  (select count(*) from public.collections),
  1::bigint,
  'RLS hides the first user collections from the second user'
);

select throws_ok(
  $$
    insert into public.collections (id, user_id, name, color)
    values (
      '10000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-000000000001',
      'Cross-account collection',
      '#000000'
    )
  $$,
  '42501',
  null,
  'RLS rejects inserting rows for another user'
);

select throws_ok(
  $$
    insert into public.words (
      id, user_id, collection_id, term, normalized_term, definition
    ) values (
      '20000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'Cross-account word',
      'cross-account-word',
      'Must not reference another user collection.'
    )
  $$,
  '23503',
  null,
  'composite ownership keys reject cross-user relationships'
);

insert into public.words (
  id,
  user_id,
  collection_id,
  term,
  normalized_term,
  definition
)
values (
  '20000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'Scope',
  'scope',
  'The same normalized term for another user.'
);

select pass('normalized-term uniqueness is scoped per user');

select throws_ok(
  $$
    select public.record_word_view(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000099',
      '2026-01-05T10:00:00Z'
    )
  $$,
  '42501',
  'word not found',
  'transactional functions cannot mutate another user word'
);

reset role;

insert into public.collections (id, user_id, name, color)
values (
  '10000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  'Cascade test',
  '#EE6FA8'
);

insert into public.words (
  id,
  user_id,
  collection_id,
  term,
  normalized_term,
  definition
)
values (
  '20000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  'Cascade',
  'cascade',
  'A cascade test word.'
);

insert into public.learning_events (id, user_id, word_id, type, occurred_at)
values (
  '30000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000006',
  'view',
  '2026-01-01T10:00:00Z'
);

delete from auth.users
where id = '00000000-0000-4000-8000-000000000003';

select is(
  (select count(*) from public.collections where user_id = '00000000-0000-4000-8000-000000000003'),
  0::bigint,
  'account deletion cascades to collections'
);
select is(
  (select count(*) from public.words where user_id = '00000000-0000-4000-8000-000000000003'),
  0::bigint,
  'account deletion cascades to words'
);
select is(
  (select count(*) from public.learning_events where user_id = '00000000-0000-4000-8000-000000000003'),
  0::bigint,
  'account deletion cascades to learning events'
);

select * from finish();

rollback;
