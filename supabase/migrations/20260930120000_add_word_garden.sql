-- Practice uses the original local calendar date; pre-garden history had no
-- timezone metadata, so UTC is the explicit, stable legacy interpretation.
alter table public.learning_events add column practice_date date;
update public.learning_events
set practice_date = (occurred_at at time zone 'UTC')::date
where type in ('rating', 'game_answered', 'game_missed');
alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check
  check (type in ('view', 'rating', 'notification_open', 'game_seen', 'game_missed', 'game_answered', 'game_relearned', 'garden_tree'));

-- Physical vocabulary deletion also retains practice; account deletion still
-- cascades through user_id as before.
alter table public.learning_events drop constraint learning_events_word_id_user_id_fkey;
alter table public.learning_events add constraint learning_events_word_id_user_id_fkey
  foreign key (word_id, user_id) references public.words(id, user_id) on delete set null (word_id);
create unique index garden_tree_milestone_idx on public.learning_events(user_id, value) where type = 'garden_tree';
create index learning_events_practice_date_idx on public.learning_events(user_id, practice_date)
  where type in ('rating', 'game_answered', 'game_missed');

create function public.prepare_garden_event() returns trigger
language plpgsql set search_path = '' as $$
declare v_days integer; v_ordinal integer;
begin
  if new.type in ('rating', 'game_answered', 'game_missed') then
    new.practice_date := coalesce(new.practice_date, (new.occurred_at at time zone 'UTC')::date);
    if abs(new.practice_date - (new.occurred_at at time zone 'UTC')::date) > 1 then
      raise exception 'invalid practice date' using errcode = '22023';
    end if;
  elsif new.type = 'garden_tree' then
    if new.word_id is not null or new.practice_date is null or new.value is null
      or new.value !~ '^[1-9][0-9]{0,7}$' then
      raise exception 'invalid garden milestone' using errcode = '22023';
    end if;
    v_ordinal := new.value::integer;
    if new.id <> md5('wordfold:garden:' || new.user_id::text || ':' || new.value)::uuid then
      raise exception 'invalid garden identity' using errcode = '22023';
    end if;
    -- A retry of an already planted tree remains idempotent even after history
    -- changes. New rewards require ten distinct practice dates per milestone.
    if not exists (select 1 from public.learning_events where id = new.id) then
      select count(distinct practice_date) into v_days from public.learning_events
      where user_id = new.user_id and type in ('rating', 'game_answered', 'game_missed')
        and practice_date <= (now() at time zone 'UTC')::date + 1;
      if v_ordinal::bigint * 10 > v_days then
        raise exception 'garden milestone not earned' using errcode = '22023';
      end if;
    end if;
  else
    new.practice_date := null;
  end if;
  return new;
end;
$$;
create trigger learning_events_prepare_garden before insert on public.learning_events
for each row execute function public.prepare_garden_event();
revoke execute on function public.prepare_garden_event() from public, anon, authenticated;

create function public.apply_word_rating_v3(
  p_word_id uuid, p_event_id uuid, p_rating text, p_state text,
  p_understood_streak integer, p_lapse_count integer,
  p_last_rated_at timestamptz, p_next_review_at timestamptz,
  p_known_streak integer, p_practice_date date
) returns public.words
language plpgsql security invoker set search_path = '' as $$
declare
  v_word public.words%rowtype;
  v_event uuid;
begin
  if p_rating is null or p_rating not in ('again', 'understood', 'learned')
    or p_state is null or p_state not in ('cannot_remember', 'understood', 'learned')
    or p_understood_streak is null or p_understood_streak < 0
    or p_lapse_count is null or p_lapse_count < 0
    or p_known_streak is null or p_known_streak < 0
    or p_last_rated_at is null or p_practice_date is null
    or abs(p_practice_date - (p_last_rated_at at time zone 'UTC')::date) > 1 then
    raise exception 'invalid rating' using errcode = '22023';
  end if;
  if (p_rating <> 'learned' and p_known_streak <> 0)
    or (p_state = 'learned' and (p_rating <> 'learned' or p_next_review_at is not null))
    or (p_state <> 'learned' and (p_next_review_at is null or p_next_review_at <= p_last_rated_at)) then
    raise exception 'invalid review schedule' using errcode = '22023';
  end if;
  select * into v_word from public.words
    where id = p_word_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then
    -- The deliberate practice still happened even if another device removed
    -- the word. Retain its date without recreating the vocabulary.
    insert into public.learning_events (id, user_id, word_id, type, value, occurred_at, practice_date)
      values (p_event_id, auth.uid(), null, 'rating', p_rating, p_last_rated_at, p_practice_date)
      on conflict (id) do nothing;
    return v_word;
  end if;

  if exists (select 1 from public.learning_events where id = p_event_id) then return v_word; end if;
  insert into public.learning_events (id, user_id, word_id, type, value, occurred_at, practice_date)
    values (p_event_id, auth.uid(), p_word_id, 'rating', p_rating, p_last_rated_at, p_practice_date)
    on conflict (id) do nothing returning id into v_event;
  if v_event is null then return v_word; end if;
  -- Stale offline practice counts as showing up, while confirmations retain
  -- the existing due-review and ordering guards.
  if p_last_rated_at <= v_word.last_rated_at
    or (p_rating = 'learned' and (v_word.state = 'learned' or p_last_rated_at < v_word.next_review_at))
    or (p_rating = 'learned' and p_known_streak <> v_word.known_streak + 1) then
    return v_word;
  end if;
  update public.words set state = p_state, known_streak = p_known_streak,
    understood_streak = p_understood_streak, lapse_count = p_lapse_count,
    last_rated_at = p_last_rated_at, next_review_at = p_next_review_at
    where id = p_word_id and user_id = auth.uid() returning * into v_word;
  return v_word;
end;
$$;
revoke execute on function public.apply_word_rating_v3(uuid, uuid, text, text, integer, integer, timestamptz, timestamptz, integer, date) from public, anon;
grant execute on function public.apply_word_rating_v3(uuid, uuid, text, text, integer, integer, timestamptz, timestamptz, integer, date) to authenticated;

