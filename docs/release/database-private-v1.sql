-- Reviewed schema template. Apply once through the migration tool as postgres.
-- Existing private schema is required; do not change its shared privileges.
-- No release data, player records, public API, or public.games registration.
create table private.shatekki_releases (
  rules_version text primary key check (length(btrim(rules_version)) > 0),
  title text not null check (length(btrim(title)) > 0),
  value_status text not null default 'approved' check (value_status = 'approved'),
  ranking_public boolean not null default false check (ranking_public = false),
  lab_integration_enabled boolean not null default false check (lab_integration_enabled = false),
  source_commit text not null check (source_commit ~ '^[0-9a-f]{40}$'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  tuning jsonb not null,
  catalog jsonb not null,
  approved_at timestamptz not null default now(),
  constraint shatekki_release_tuning_shape check (
    (jsonb_typeof(tuning) = 'object' and tuning ->> 'valueStatus' = 'approved') is true
  ),
  constraint shatekki_release_catalog_shape check (
    (jsonb_typeof(catalog) = 'object'
      and catalog ->> 'rulesVersion' = rules_version
      and jsonb_typeof(catalog -> 'prizes') = 'array'
      and jsonb_typeof(catalog -> 'sets') = 'array') is true
  ),
  constraint shatekki_release_catalog_counts check (
    (jsonb_array_length(catalog -> 'prizes') = 100
      and jsonb_array_length(catalog -> 'sets') = 100) is true
  ),
  constraint shatekki_release_content_hash check (
    content_sha256 = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'rulesVersion', rules_version,
        'title', title,
        'valueStatus', value_status,
        'rankingPublic', ranking_public,
        'labIntegrationEnabled', lab_integration_enabled,
        'tuning', tuning,
        'catalog', catalog
      )::text, 'UTF8'
    )), 'hex')
  )
);

alter table private.shatekki_releases owner to postgres;
alter table private.shatekki_releases enable row level security;
-- No policies. This release is managed only by the database owner.
revoke all on table private.shatekki_releases from public, anon, authenticated, service_role;

create function private.shatekki_release_reject_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'Shatekki releases are immutable; use a new rules_version.';
  return null;
end;
$function$;

alter function private.shatekki_release_reject_change() owner to postgres;
revoke all on function private.shatekki_release_reject_change() from public, anon, authenticated, service_role;

create trigger shatekki_release_immutable
before update or delete or truncate on private.shatekki_releases
for each statement execute function private.shatekki_release_reject_change();

comment on table private.shatekki_releases is
  'Owner-managed immutable approved release snapshots. Ranking and lab integration remain disabled; no player data.';
