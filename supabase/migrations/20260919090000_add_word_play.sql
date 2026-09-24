-- Game history is append-only, using the existing per-user PowerSync stream.
alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check
  check (type in ('view', 'rating', 'notification_open', 'game_seen', 'game_missed', 'game_answered', 'game_relearned'));

create index learning_events_word_type_idx on public.learning_events(user_id, word_id, type);

-- Retrying an upload must not reset a word again after later learning progress.
create function public.relearn_game_word(p_word_id uuid, p_event_id uuid, p_value text, p_occurred_at timestamptz)
returns public.words
language plpgsql security invoker set search_path = ''
as $$
declare
  v_word public.words%rowtype;
  v_inserted uuid;
begin
  if p_value is null or p_occurred_at is null then
    raise exception 'game session and time are required' using errcode = '22023';
  end if;
  select * into v_word from public.words
    where id = p_word_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then
    raise exception 'word not found' using errcode = '42501';
  end if;
  insert into public.learning_events (id, user_id, word_id, type, value, occurred_at)
    values (p_event_id, auth.uid(), p_word_id, 'game_relearned', p_value, p_occurred_at)
    on conflict (id) do nothing returning id into v_inserted;
  if v_inserted is null then return v_word; end if;
  -- Respect progress made on another device since this offline request.
  if v_word.state = 'learned' and (v_word.last_rated_at is null or v_word.last_rated_at <= p_occurred_at) then
    update public.words set state = 'cannot_remember', understood_streak = 0, known_streak = 0,
      next_review_at = p_occurred_at, updated_at = now()
      where id = p_word_id and user_id = auth.uid() returning * into v_word;
  end if;
  return v_word;
end;
$$;
revoke all on function public.relearn_game_word(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.relearn_game_word(uuid, uuid, text, timestamptz) to authenticated;
