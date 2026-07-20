alter table public.words
  add column source_pronunciation_locale text not null default 'en-US'
    check (length(trim(source_pronunciation_locale)) > 0),
  add column target_pronunciation_locale text not null default 'sk-SK'
    check (length(trim(target_pronunciation_locale)) > 0);

drop index if exists public.words_user_normalized_term_active_idx;

update public.words
set normalized_term = lower(regexp_replace(trim(normalize(term, NFKC)), '\s+', ' ', 'g'));

create index words_user_source_normalized_active_idx
  on public.words(user_id, source_language_code, normalized_term)
  where deleted_at is null;

comment on column public.words.source_pronunciation_locale is
  'Exact BCP-47 locale used when pronouncing the learning-language term.';

comment on column public.words.target_pronunciation_locale is
  'Exact BCP-47 locale reserved for optional translation pronunciation.';
