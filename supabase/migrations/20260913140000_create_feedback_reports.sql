create table public.feedback_reports (
  id uuid primary key,
  installation_id uuid not null,
  category text not null check (category in ('bug', 'content', 'missing', 'idea', 'other')),
  message text not null,
  contact_email text not null,
  report jsonb not null,
  network_hash text not null,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'resolved', 'closed')),
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed')),
  email_attempts integer not null default 0,
  email_first_attempt_at timestamptz,
  email_next_attempt_at timestamptz not null default now(),
  email_lease uuid,
  email_provider_id text,
  email_error text
);
alter table public.feedback_reports enable row level security;
revoke all on public.feedback_reports from public, anon, authenticated;
grant all on public.feedback_reports to service_role;
create index feedback_reports_created on public.feedback_reports(created_at);
create index feedback_reports_installation on public.feedback_reports(installation_id, created_at);
create index feedback_reports_network on public.feedback_reports(network_hash, created_at);

-- Serialize acceptance so concurrent requests cannot bypass the quotas or duplicate a report.
create function public.accept_feedback(p_report jsonb, p_network_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare existing jsonb;
begin
  perform pg_advisory_xact_lock(7149131400);
  select report into existing from public.feedback_reports where id = (p_report->>'id')::uuid;
  if found then
    if existing = p_report then return 'accepted'; end if;
    return 'conflict';
  end if;
  if (select count(*) from public.feedback_reports where created_at > now() - interval '1 day') >= 200
    or (select count(*) from public.feedback_reports where installation_id = (p_report->>'installationId')::uuid and created_at > now() - interval '1 day') >= 20
    or (select count(*) from public.feedback_reports where network_hash = p_network_hash and created_at > now() - interval '1 hour') >= 50 then
    return 'limited';
  end if;
  insert into public.feedback_reports(id, installation_id, category, message, contact_email, report, network_hash)
  values ((p_report->>'id')::uuid, (p_report->>'installationId')::uuid, p_report->>'category', p_report->>'message', p_report->>'contactEmail', p_report, p_network_hash);
  return 'accepted';
end;
$$;
revoke all on function public.accept_feedback(jsonb, text) from public, anon, authenticated;
grant execute on function public.accept_feedback(jsonb, text) to service_role;

create function public.claim_feedback_emails()
returns setof public.feedback_reports language plpgsql security definer set search_path = '' as $$
begin
  -- Resend deduplicates for 24h. Never automatically retry an ambiguous send outside that window.
  update public.feedback_reports set email_status = 'failed', email_error = 'Delivery requires manual review', email_lease = null
  where email_status in ('pending', 'sending') and
    (email_first_attempt_at < now() - interval '23 hours' or (email_attempts >= 12 and email_next_attempt_at <= now()));
  return query
  with picked as (
    select id from public.feedback_reports
    where email_status in ('pending', 'sending') and email_next_attempt_at <= now()
    order by created_at limit 10 for update skip locked
  )
  update public.feedback_reports f set email_status = 'sending', email_attempts = email_attempts + 1,
    email_first_attempt_at = coalesce(email_first_attempt_at, now()),
    email_next_attempt_at = now() + interval '5 minutes', email_lease = gen_random_uuid()
  from picked where f.id = picked.id returning f.*;
end;
$$;
revoke all on function public.claim_feedback_emails() from public, anon, authenticated;
grant execute on function public.claim_feedback_emails() to service_role;

-- Vault values are configured at deployment, never committed to the repository.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create function public.dispatch_feedback_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare endpoint text; worker_secret text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'feedback_notify_url' limit 1;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'feedback_worker_secret' limit 1;
  if endpoint is null or worker_secret is null then return; end if;
  perform net.http_post(url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-feedback-worker-secret', worker_secret),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
end;
$$;
revoke all on function public.dispatch_feedback_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_feedback_notifications() to service_role;
select cron.schedule('wordfold-feedback-email', '* * * * *', 'select public.dispatch_feedback_notifications()');
