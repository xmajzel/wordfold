-- Immutable JSON indexes for explicit public-catalog pronunciation downloads.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'pron-manifests',
  'pron-manifests',
  true,
  8388608,
  array['application/json']
);
