-- Guest-readable release policy, managed only by trusted administrators.
create table public.app_release_policies (
  application_id text not null,
  platform text not null check (platform in ('android', 'ios')),
  channel text not null check (channel in ('preview', 'production')),
  latest_build integer not null check (latest_build > 0),
  minimum_supported_build integer not null check (minimum_supported_build > 0 and minimum_supported_build <= latest_build),
  message text not null default '' check (length(message) <= 500),
  store_url text not null check (store_url like 'https://%'),
  primary key (application_id, platform, channel)
);

alter table public.app_release_policies enable row level security;
revoke all on public.app_release_policies from anon, authenticated;
grant select on public.app_release_policies to anon, authenticated;
grant all on public.app_release_policies to service_role;
create policy "Anyone can read release policies" on public.app_release_policies
  for select to anon, authenticated using (true);

-- No seed: a release is announced only after its store rollout is available.
