import type { FeedbackReport } from '../../../supabase/functions/_shared/feedback';

export function feedbackFixture(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    id: '11111111-1111-4111-8111-111111111111', installationId: '22222222-2222-4222-8222-222222222222',
    category: 'bug', reason: '', message: 'The card skips two words.', correction: '', contactEmail: '',
    requestedItem: '', languageRole: '', context: {
      screen: 'today', appVersion: '1.0.0', build: '12', platform: 'android', osVersion: '36',
      sourceLanguageCode: 'en', targetLanguageCode: 'sk', word: null,
    }, ...overrides,
  };
}
