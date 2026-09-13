export const feedbackCategories = {
  bug: 'Something isn’t working',
  content: 'A word or translation is wrong',
  missing: 'Something is missing',
  idea: 'I have an improvement idea',
  other: 'Other feedback',
} as const;

export const contentReasons = ['Translation', 'Meaning', 'Example', 'Spelling', 'Pronunciation', 'Other'] as const;
export type FeedbackCategory = keyof typeof feedbackCategories;
export type FeedbackWord = {
  id: string; term: string; definition: string; translation: string | null;
  example: string | null; catalogSenseId: string | null;
  sourceLanguageCode: string; targetLanguageCode: string; source: string;
};
export type FeedbackReport = {
  id: string;
  installationId: string;
  category: FeedbackCategory;
  reason: string;
  message: string;
  correction: string;
  contactEmail: string;
  requestedItem: string;
  languageRole: '' | 'learn' | 'hints';
  context: {
    screen: string; appVersion: string; build: string; platform: string; osVersion: string;
    sourceLanguageCode: string; targetLanguageCode: string;
    word: FeedbackWord | null;
  };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !value.includes('\u0000');
}

// One contract for local drafts and untrusted network input. Extra fields are rejected.
export function isFeedbackReport(value: unknown): value is FeedbackReport {
  if (!object(value) || Object.keys(value).sort().join(',') !==
    'category,contactEmail,context,correction,id,installationId,languageRole,message,reason,requestedItem') return false;
  if (typeof value.id !== 'string' || !uuid.test(value.id)
    || typeof value.installationId !== 'string' || !uuid.test(value.installationId)
    || typeof value.category !== 'string' || !Object.hasOwn(feedbackCategories, value.category)
    || !bounded(value.reason, 80) || !bounded(value.message, 4000)
    || !bounded(value.correction, 1000) || !bounded(value.requestedItem, 200)
    || !bounded(value.contactEmail, 254) || (value.contactEmail !== '' && !email.test(value.contactEmail))
    || !['', 'learn', 'hints'].includes(String(value.languageRole))) return false;
  const c = value.context;
  if (!object(c) || Object.keys(c).sort().join(',') !==
    'appVersion,build,osVersion,platform,screen,sourceLanguageCode,targetLanguageCode,word') return false;
  for (const key of ['screen', 'appVersion', 'build', 'platform', 'osVersion', 'sourceLanguageCode', 'targetLanguageCode']) {
    if (!bounded(c[key], 120)) return false;
  }
  if (c.word !== null) {
    const w = c.word;
    if (!object(w) || Object.keys(w).sort().join(',') !==
      'catalogSenseId,definition,example,id,source,sourceLanguageCode,targetLanguageCode,term,translation') return false;
    for (const key of ['id', 'term', 'definition', 'sourceLanguageCode', 'targetLanguageCode', 'source']) {
      if (!bounded(w[key], 4000)) return false;
    }
    for (const key of ['translation', 'example', 'catalogSenseId']) {
      if (w[key] !== null && !bounded(w[key], 4000)) return false;
    }
  }
  if (value.category === 'content' && !contentReasons.includes(value.reason as typeof contentReasons[number])) return false;
  if (value.category === 'missing' && !['Word', 'Language', 'Topic'].includes(value.reason)) return false;
  if (value.category === 'missing' && !value.requestedItem.trim()) return false;
  if (value.category === 'missing' && value.reason === 'Language' && !value.languageRole) return false;
  return !!value.message.trim() || (value.category === 'content' && c.word !== null)
    || value.category === 'missing';
}
