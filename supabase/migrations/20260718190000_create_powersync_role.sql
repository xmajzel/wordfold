do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'powersync_role'
  ) then
    if not exists (
      select 1
      from pg_roles
      where rolname = 'powersync_role'
        and rolcanlogin
        and rolreplication
        and rolbypassrls
        and not rolsuper
        and not rolcreatedb
        and not rolcreaterole
        and not rolinherit
    ) then
      raise exception 'existing powersync_role has unexpected privileges';
    end if;
  else
    create role powersync_role with
      noinherit
      replication
      bypassrls
      login;
  end if;
end;
$$;

grant usage on schema public to powersync_role;

revoke all on table public.collections from powersync_role;
revoke all on table public.words from powersync_role;
revoke all on table public.learning_events from powersync_role;

grant select on table public.collections to powersync_role;
grant select on table public.words to powersync_role;
grant select on table public.learning_events to powersync_role;

comment on role powersync_role is
  'Read-only logical replication role used by the PowerSync service.';
