-- Additive: old clients and already-queued legacy rating RPCs retain their contract.
alter table public.words add column known_streak integer not null default 0 check (known_streak >= 0);

create function public.apply_word_rating_v2(
  p_word_id uuid, p_event_id uuid, p_rating text, p_state text,
  p_understood_streak integer, p_lapse_count integer,
  p_last_rated_at timestamptz, p_next_review_at timestamptz,
  p_known_streak integer
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
    or p_last_rated_at is null then
    raise exception 'invalid rating' using errcode = '22023';
  end if;
  if (p_rating <> 'learned' and p_known_streak <> 0)
    or (p_state = 'learned' and (p_rating <> 'learned' or p_next_review_at is not null))
    or (p_state <> 'learned' and (p_next_review_at is null or p_next_review_at <= p_last_rated_at)) then
    raise exception 'invalid review schedule' using errcode = '22023';
  end if;
  select * into v_word from public.words
    where id = p_word_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'word not found' using errcode = '42501'; end if;

  -- Idempotent retries, older offline writes, and concurrent confirmations of the same
  -- due review cannot advance progress twice. PowerSync brings the accepted state back.
  if exists (select 1 from public.learning_events where id = p_event_id)
    or p_last_rated_at <= v_word.last_rated_at
    or (p_rating = 'learned' and (v_word.state = 'learned' or p_last_rated_at < v_word.next_review_at)) then
    return v_word;
  end if;
  if p_rating = 'learned' and p_known_streak <> v_word.known_streak + 1 then
    return v_word;
  end if;
  insert into public.learning_events (id, user_id, word_id, type, value, occurred_at)
    values (p_event_id, auth.uid(), p_word_id, 'rating', p_rating, p_last_rated_at)
    on conflict (id) do nothing returning id into v_event;
  if v_event is null then return v_word; end if;
  update public.words set state = p_state, known_streak = p_known_streak,
    understood_streak = p_understood_streak, lapse_count = p_lapse_count,
    last_rated_at = p_last_rated_at, next_review_at = p_next_review_at
    where id = p_word_id and user_id = auth.uid() returning * into v_word;
  return v_word;
end;
$$;
revoke execute on function public.apply_word_rating_v2(uuid, uuid, text, text, integer, integer, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.apply_word_rating_v2(uuid, uuid, text, text, integer, integer, timestamptz, timestamptz, integer) to authenticated;

-- Legacy clients can reset or rate a word without knowing the new column. Clear the
-- streak when their write changes learning progress, but preserve it for views/edits.
create function public.reset_legacy_known_streak() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.known_streak = old.known_streak and (
    (new.last_rated_at is distinct from old.last_rated_at and new.state <> 'learned')
    or (new.state = 'cannot_remember' and old.state = 'learned')
  ) then new.known_streak := 0; end if;
  return new;
end;
$$;
create trigger words_reset_legacy_known_streak before update on public.words
for each row execute function public.reset_legacy_known_streak();
revoke execute on function public.reset_legacy_known_streak() from public, anon, authenticated;
