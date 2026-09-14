begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_column('public', 'pronunciation_catalog_inputs', 'source_language_code', 'catalog inputs identify their language');
select ok(exists(select 1 from public.pronunciation_catalog_inputs where source_language_code = 'es' and catalog_sense_id like '%c2%'), 'Spanish C2 is seeded');
select lives_ok($test$
  select public.claim_public_pronunciation(
    (select catalog_sense_id from public.pronunciation_catalog_inputs where source_language_code = 'es' limit 1),
    'es-ES', 'azure', 'es-ES-ElviraNeural', 'Standard Neural S0', 'audio-24khz-96kbitrate-mono-mp3',
    'azure-public-preview-v1', repeat('1', 64), 120)
$test$, 'Spain catalog pronunciation can be claimed');
select lives_ok($test$
  select public.claim_public_pronunciation(
    (select catalog_sense_id from public.pronunciation_catalog_inputs where source_language_code = 'es' limit 1),
    'es-MX', 'azure', 'es-MX-JorgeNeural', 'Standard Neural S0', 'audio-24khz-96kbitrate-mono-mp3',
    'azure-public-preview-v1', repeat('2', 64), 120)
$test$, 'Mexico catalog pronunciation can be claimed');
select throws_ok($test$
  select public.claim_public_pronunciation(
    (select catalog_sense_id from public.pronunciation_catalog_inputs where source_language_code = 'en' limit 1),
    'es-ES', 'azure', 'es-ES-ElviraNeural', 'Standard Neural S0', 'audio-24khz-96kbitrate-mono-mp3',
    'azure-public-preview-v1', repeat('3', 64), 120)
$test$, '22023', 'catalog pronunciation input not found', 'English text cannot use Spanish catalog pronunciation');
select throws_ok($test$
  select public.claim_public_pronunciation(
    (select catalog_sense_id from public.pronunciation_catalog_inputs where source_language_code = 'es' limit 1),
    'en-US', 'azure', 'en-US-AvaNeural', 'Standard Neural S0', 'audio-24khz-96kbitrate-mono-mp3',
    'azure-public-preview-v1', repeat('4', 64), 120)
$test$, '22023', 'catalog pronunciation input not found', 'Spanish text cannot use English catalog pronunciation');
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000099');
select lives_ok($test$
  select public.claim_private_pronunciation('00000000-0000-4000-8000-000000000099',
    'es-ES', 'azure', 'es-ES-ElviraNeural', 'Standard Neural S0', 'audio-24khz-96kbitrate-mono-mp3',
    'azure-private-preview-v1', repeat('5', 64), 120)
$test$, 'private Spain pronunciation can be claimed');
select lives_ok($test$
  select public.claim_private_pronunciation('00000000-0000-4000-8000-000000000099',
    'es-MX', 'azure', 'es-MX-JorgeNeural', 'Standard Neural S0', 'audio-24khz-96kbitrate-mono-mp3',
    'azure-private-preview-v1', repeat('6', 64), 120)
$test$, 'private Mexico pronunciation can be claimed');
select lives_ok($test$
  select public.authorize_private_pronunciation_request('00000000-0000-4000-8000-000000000099',
    'es-MX', repeat('6', 64), 'generation', 10, 20, 1000, 10000)
$test$, 'Spanish requests retain the private budget accounting path');
select * from finish();
rollback;
