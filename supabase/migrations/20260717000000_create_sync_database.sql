create table public.collections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null check (length(trim(color)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.words (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null,
  term text not null check (length(trim(term)) > 0),
  normalized_term text not null check (length(trim(normalized_term)) > 0),
  source_language_code text not null default 'en',
  target_language_code text not null default 'sk',
  part_of_speech text,
  definition text not null check (length(trim(definition)) > 0),
  example text,
  translation text,
  catalog_sense_id text,
  cefr_level text check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  source text not null default 'manual'
    check (source in ('manual', 'spoken', 'business', 'academic')),
  state text not null default 'new'
    check (state in ('new', 'cannot_remember', 'understood', 'learned')),
  understood_streak integer not null default 0 check (understood_streak >= 0),
  lapse_count integer not null default 0 check (lapse_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  last_rated_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (collection_id, user_id)
    references public.collections(id, user_id)
    on delete cascade
);

create unique index words_user_normalized_term_active_idx
  on public.words(user_id, normalized_term)
  where deleted_at is null;

create index words_user_state_due_idx
  on public.words(user_id, state, next_review_at)
  where deleted_at is null;

create index words_user_collection_idx
  on public.words(user_id, collection_id)
  where deleted_at is null;

create table public.learning_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid,
  type text not null check (type in ('view', 'rating', 'notification_open')),
  value text,
  occurred_at timestamptz not null,
  foreign key (word_id, user_id)
    references public.words(id, user_id)
    on delete cascade
);

create index learning_events_user_time_idx
  on public.learning_events(user_id, occurred_at desc);

comment on table public.collections is 'User-owned word collections synchronized through PowerSync.';
comment on table public.words is 'User-owned vocabulary and current learning state synchronized through PowerSync.';
comment on table public.learning_events is 'Append-only user learning history synchronized through PowerSync.';

create function public.protect_sync_row_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'id is immutable' using errcode = '22000';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '22000';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable' using errcode = '22000';
  end if;

  if old.deleted_at is not null then
    if new is distinct from old then
      raise exception 'tombstoned rows cannot be changed' using errcode = '22000';
    end if;

    return old;
  end if;

  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create function public.require_empty_collection_tombstone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and exists (
    select 1
    from public.words
    where collection_id = old.id
      and user_id = old.user_id
      and deleted_at is null
  ) then
    raise exception 'collection contains active words' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger collections_require_empty_tombstone
before update on public.collections
for each row execute function public.require_empty_collection_tombstone();

create trigger collections_protect_sync_fields
before update on public.collections
for each row execute function public.protect_sync_row_update();

create trigger words_protect_sync_fields
before update on public.words
for each row execute function public.protect_sync_row_update();

create function public.apply_word_rating(
  p_word_id uuid,
  p_event_id uuid,
  p_rating text,
  p_state text,
  p_understood_streak integer,
  p_lapse_count integer,
  p_last_rated_at timestamptz,
  p_next_review_at timestamptz
)
returns public.words
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_word public.words%rowtype;
  v_inserted_event_id uuid;
begin
  if p_rating is null or p_rating not in ('again', 'understood', 'learned') then
    raise exception 'invalid rating' using errcode = '22023';
  end if;

  if p_state is null or p_state not in ('new', 'cannot_remember', 'understood', 'learned') then
    raise exception 'invalid learning state' using errcode = '22023';
  end if;

  if p_understood_streak is null or p_lapse_count is null
    or p_understood_streak < 0 or p_lapse_count < 0 then
    raise exception 'learning counters cannot be negative' using errcode = '22023';
  end if;

  if p_last_rated_at is null then
    raise exception 'rating time is required' using errcode = '22023';
  end if;

  select *
  into v_word
  from public.words
  where id = p_word_id
    and user_id = auth.uid()
    and deleted_at is null
  for update;

  if not found then
    raise exception 'word not found' using errcode = '42501';
  end if;

  insert into public.learning_events (id, user_id, word_id, type, value, occurred_at)
  values (p_event_id, auth.uid(), p_word_id, 'rating', p_rating, p_last_rated_at)
  on conflict (id) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    return v_word;
  end if;

  update public.words
  set state = p_state,
      understood_streak = p_understood_streak,
      lapse_count = p_lapse_count,
      last_rated_at = p_last_rated_at,
      next_review_at = p_next_review_at
  where id = p_word_id
    and user_id = auth.uid()
  returning * into v_word;

  return v_word;
end;
$$;

create function public.record_word_view(
  p_word_id uuid,
  p_event_id uuid,
  p_occurred_at timestamptz
)
returns public.words
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_word public.words%rowtype;
  v_inserted_event_id uuid;
begin
  if p_occurred_at is null then
    raise exception 'view time is required' using errcode = '22023';
  end if;

  select *
  into v_word
  from public.words
  where id = p_word_id
    and user_id = auth.uid()
    and deleted_at is null
  for update;

  if not found then
    raise exception 'word not found' using errcode = '42501';
  end if;

  insert into public.learning_events (id, user_id, word_id, type, occurred_at)
  values (p_event_id, auth.uid(), p_word_id, 'view', p_occurred_at)
  on conflict (id) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    return v_word;
  end if;

  update public.words
  set view_count = view_count + 1,
      last_viewed_at = greatest(last_viewed_at, p_occurred_at)
  where id = p_word_id
    and user_id = auth.uid()
  returning * into v_word;

  return v_word;
end;
$$;

create function public.tombstone_word(p_word_id uuid)
returns public.words
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_word public.words%rowtype;
begin
  select *
  into v_word
  from public.words
  where id = p_word_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'word not found' using errcode = '42501';
  end if;

  if v_word.deleted_at is not null then
    return v_word;
  end if;

  update public.words
  set deleted_at = clock_timestamp()
  where id = p_word_id
    and user_id = auth.uid()
  returning * into v_word;

  return v_word;
end;
$$;

create function public.tombstone_collection(p_collection_id uuid)
returns public.collections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_collection public.collections%rowtype;
begin
  select *
  into v_collection
  from public.collections
  where id = p_collection_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'collection not found' using errcode = '42501';
  end if;

  if v_collection.deleted_at is not null then
    return v_collection;
  end if;

  update public.collections
  set deleted_at = clock_timestamp()
  where id = p_collection_id
    and user_id = auth.uid()
  returning * into v_collection;

  return v_collection;
end;
$$;

alter table public.collections enable row level security;
alter table public.words enable row level security;
alter table public.learning_events enable row level security;

create policy "read owned collections"
on public.collections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert owned collections"
on public.collections
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "update owned collections"
on public.collections
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "read owned words"
on public.words
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert owned words"
on public.words
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "update owned words"
on public.words
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "read owned learning events"
on public.learning_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert owned learning events"
on public.learning_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

revoke all on table public.collections from anon, authenticated;
revoke all on table public.words from anon, authenticated;
revoke all on table public.learning_events from anon, authenticated;

grant select, insert, update on table public.collections to authenticated;
grant select, insert, update on table public.words to authenticated;
grant select, insert on table public.learning_events to authenticated;

revoke execute on function public.protect_sync_row_update() from public, anon, authenticated;
revoke execute on function public.require_empty_collection_tombstone() from public, anon, authenticated;

revoke execute on function public.apply_word_rating(
  uuid, uuid, text, text, integer, integer, timestamptz, timestamptz
) from public, anon;
grant execute on function public.apply_word_rating(
  uuid, uuid, text, text, integer, integer, timestamptz, timestamptz
) to authenticated;

revoke execute on function public.record_word_view(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.record_word_view(uuid, uuid, timestamptz) to authenticated;

revoke execute on function public.tombstone_word(uuid) from public, anon;
grant execute on function public.tombstone_word(uuid) to authenticated;

revoke execute on function public.tombstone_collection(uuid) from public, anon;
grant execute on function public.tombstone_collection(uuid) to authenticated;

create publication powersync
for table public.collections, public.words, public.learning_events;
