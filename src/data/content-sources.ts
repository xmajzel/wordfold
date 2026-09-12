import { SPANISH_DEFINITION_REVIEW_DISCLOSURE } from './spanish-course-runtime';

export interface ContentSourceNotice {
  id: string;
  title: string;
  body: string;
  url: string;
  license?: string;
}

export const englishContentSources: readonly ContentSourceNotice[] = [
  {
    id: 'oewn',
    title: 'Open English WordNet 2025',
    body: 'Definitions, examples, parts of speech, and sense data are adapted from Open English WordNet 2025 by the Global WordNet Association.',
    url: 'https://github.com/globalwordnet/english-wordnet',
    license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  },
  {
    id: 'cefr-j',
    title: 'CEFR-J Wordlist 1.6',
    body: 'The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from https://www.cefr-j.org/download.html on 16 July 2026.',
    url: 'https://www.cefr-j.org/download.html',
  },
  {
    id: 'octanove',
    title: 'Octanove Vocabulary Profile C1/C2 1.0',
    body: 'The C1–C2 headwords and source parts of speech are adapted from the Octanove Vocabulary Profile C1/C2 Version 1.0, created by Octanove Labs and published through Open Language Profiles.',
    url: 'https://github.com/openlanguageprofiles/olp-en-cefrj',
    license: 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)',
  },
  {
    id: 'madlad',
    title: 'MADLAD-400-3B-MT',
    body: 'Bundled English-to-Slovak hints were generated with the pinned int8 CTranslate2 conversion cstr/madlad400-3b-ct2-int8 of google/madlad400-3b-mt.',
    url: 'https://huggingface.co/cstr/madlad400-3b-ct2-int8',
    license: 'Apache License 2.0',
  },
  {
    id: 'ngsl',
    title: 'NGSL discovery packs',
    body: 'The optional Spoken, Business, and Academic word lists are adapted from work by Charles Browne, Brent Culligan, and Joseph Phillips through the New General Service List Project.',
    url: 'https://www.newgeneralservicelist.org/',
    license: 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)',
  },
] as const;

export const spanishContentSources: readonly ContentSourceNotice[] = [
  {
    id: 'pcic',
    title: 'Plan Curricular del Instituto Cervantes (PCIC)',
    body: 'Spanish learning content is structured according to the Plan Curricular del Instituto Cervantes (PCIC), A1-C2. No certification, accreditation, endorsement, or official validation by Instituto Cervantes is implied, and no PCIC content is bundled.',
    url: 'https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/indice.htm',
  },
  {
    id: 'elelex',
    title: 'ELELex',
    body: 'Spanish vocabulary level data is based in part on ELELex, a CEFR-graded lexical resource developed as part of the CEFRLex project at UCLouvain/CENTAL.',
    url: 'https://cental.uclouvain.be/cefrlex/',
  },
  {
    id: 'mcr-omw',
    title: 'Multilingual Central Repository / Open Multilingual Wordnet',
    body: 'Multilingual Central Repository 3.0 (release 2016), González-Agirre, Laparra and Rigau (2012), packaged by Open Multilingual Wordnet 2.0.',
    url: 'https://github.com/omwn/omw-data/releases/tag/v2.0',
    license: 'Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
  },
  {
    id: 'wordnet-3',
    title: 'WordNet 3.0',
    body: 'WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved. WordNet is used as semantic reference evidence for the Spanish source pipeline, not as learner-facing definitions.',
    url: 'https://wordnet.princeton.edu/',
    license: 'WordNet 3.0 license; complete notice below',
  },
] as const;

export const spanishReviewDisclosure = SPANISH_DEFINITION_REVIEW_DISCLOSURE;

export const wordNet3LicenseNotice = `WordNet Release 3.0

This software and database is being provided to you, the LICENSEE, by Princeton University under the following license. By obtaining, using and/or copying this software and database, you agree that you have read, understood, and will comply with these terms and conditions.:

Permission to use, copy, modify and distribute this software and database and its documentation for any purpose and without fee or royalty is hereby granted, provided that you agree to comply with the following copyright notice and statements, including the disclaimer, and that the same appear on ALL copies of the software, database and documentation, including modifications that you make for internal use or for distribution.

WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.

THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT-ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.

The name of Princeton University or Princeton may not be used in advertising or publicity pertaining to distribution of the software and/or database. Title to copyright in this software, database and any associated documentation shall at all times remain with Princeton University and LICENSEE agrees to preserve same.`;
