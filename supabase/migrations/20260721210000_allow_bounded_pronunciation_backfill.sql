-- Permit the approved development backfill to use a temporary 20,000 request/hour limit.
-- The deployed secret remains the actual limit; the normal value is still 20.
create or replace function public.authorize_public_pronunciation_request(
  p_user_id uuid,
  p_catalog_sense_id text,
  p_locale text,
  p_request_key text,
  p_request_kind text,
  p_billed_characters integer,
  p_user_hourly_request_limit integer,
  p_user_daily_character_limit integer,
  p_global_daily_character_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hourly_requests bigint;
  v_user_daily_characters bigint;
  v_global_daily_characters bigint;
  v_outcome text := 'allowed';
  v_request_id uuid;
begin
  if p_user_id is null
    or p_catalog_sense_id is null
    or p_locale is null
    or p_locale not in ('en-US', 'en-GB')
    or p_request_key is null
    or p_request_kind is null
    or p_billed_characters is null
    or p_user_hourly_request_limit is null
    or p_user_daily_character_limit is null
    or p_global_daily_character_limit is null
    or p_request_key !~ '^[a-f0-9]{64}$'
    or p_request_kind not in ('cache_hit', 'pending', 'generation')
    or p_billed_characters not between 0 and 200
    or (p_request_kind = 'generation' and p_billed_characters = 0)
    or (p_request_kind <> 'generation' and p_billed_characters <> 0)
    or p_user_hourly_request_limit not between 1 and 20000
    or p_user_daily_character_limit not between 1 and 1000000
    or p_global_daily_character_limit not between 1 and 100000000 then
    raise exception 'invalid pronunciation budget request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(2147483000);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  delete from public.pronunciation_requests
  where created_at < clock_timestamp() - interval '30 days';

  select count(*)
  into v_hourly_requests
  from public.pronunciation_requests
  where user_id = p_user_id
    and created_at >= clock_timestamp() - interval '1 hour';

  if v_hourly_requests >= p_user_hourly_request_limit then
    v_outcome := 'rate_limited';
  elsif p_request_kind = 'generation' then
    select coalesce(sum(billed_characters), 0)
    into v_user_daily_characters
    from public.pronunciation_requests
    where user_id = p_user_id
      and outcome = 'allowed'
      and created_at >= date_trunc('day', clock_timestamp());

    select coalesce(sum(billed_characters), 0)
    into v_global_daily_characters
    from public.pronunciation_requests
    where outcome = 'allowed'
      and created_at >= date_trunc('day', clock_timestamp());

    if v_user_daily_characters + p_billed_characters > p_user_daily_character_limit then
      v_outcome := 'user_budget_limited';
    elsif v_global_daily_characters + p_billed_characters > p_global_daily_character_limit then
      v_outcome := 'global_budget_limited';
    end if;
  end if;

  insert into public.pronunciation_requests (
    user_id,
    catalog_sense_id,
    locale,
    request_key,
    request_kind,
    billed_characters,
    outcome
  ) values (
    p_user_id,
    p_catalog_sense_id,
    p_locale,
    p_request_key,
    p_request_kind,
    case when v_outcome = 'allowed' then p_billed_characters else 0 end,
    v_outcome
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'allowed', v_outcome = 'allowed',
    'reason', case when v_outcome = 'allowed' then null else v_outcome end,
    'requestId', v_request_id
  );
end;
$$;
