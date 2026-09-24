import { render } from '@testing-library/react-native';

import type { Word } from '@/domain/types';
import { applyRating } from '@/features/learning/algorithm';
import { ConfirmationProgress } from './confirmation-progress';

const word: Pick<Word, 'state' | 'knownStreak' | 'nextReviewAt'> = {
  state: 'understood', knownStreak: 1, nextReviewAt: '2026-10-01T12:00:00Z',
};

it.each([2, 3] as const)('shows progress and remaining confirmations for rhythm %s', async (confirmations) => {
  const view = await render(<ConfirmationProgress word={word} confirmations={confirmations} detailed/>);
  expect(view.getByRole('progressbar').props.accessibilityValue.now).toBe(1);
  expect(view.getByText(`${1} of ${confirmations} confirmations`)).toBeTruthy();
  expect(view.getByText(confirmations === 2
    ? '1 more “I know this” confirmation to mark as learned.'
    : '2 more “I know this” confirmations to mark as learned.')).toBeTruthy();
  expect(view.getByText(`Next review: ${new Date(word.nextReviewAt!).toLocaleDateString()}`)).toBeTruthy();
});

it('treats legacy missing progress as zero and omits a missing review date', async () => {
  const view = await render(<ConfirmationProgress word={{ state: 'new', nextReviewAt: null }} confirmations={3} detailed/>);
  expect(view.getByText('0 of 3 confirmations')).toBeTruthy();
  expect(view.queryByText(/Next review/)).toBeNull();
});

it('updates after a reset and hides progress on completion', async () => {
  const view = await render(<ConfirmationProgress word={word} confirmations={2}/>);
  const reset = applyRating({ ...word, understoodStreak: 0, lapseCount: 0 }, 'understood');
  await view.rerender(<ConfirmationProgress word={reset} confirmations={2}/>);
  expect(view.getByText('0 of 2 confirmations')).toBeTruthy();
  const completed = applyRating({ ...word, nextReviewAt: null, understoodStreak: 0, lapseCount: 0 }, 'learned', new Date(), () => 0, 2);
  await view.rerender(<ConfirmationProgress word={completed} confirmations={2}/>);
  expect(view.queryByRole('progressbar')).toBeNull();
});

it('requires another confirmation when the target is lowered for an active word', async () => {
  const active = { ...word, knownStreak: 2 };
  const view = await render(<ConfirmationProgress word={active} confirmations={3}/>);
  await view.rerender(<ConfirmationProgress word={active} confirmations={2}/>);
  expect(view.getByText('2 of 2 confirmations')).toBeTruthy();
  expect(view.getByText('1 more “I know this” confirmation to mark as learned.')).toBeTruthy();
  await view.rerender(<ConfirmationProgress word={active} confirmations={1}/>);
  expect(view.queryByRole('progressbar')).toBeNull();
});

it('keeps legacy learned words complete even without a stored count', async () => {
  const view = await render(<ConfirmationProgress word={{ state: 'learned', nextReviewAt: null }} confirmations={3} detailed/>);
  expect(view.queryByRole('progressbar')).toBeNull();
  expect(view.queryByText(/more/)).toBeNull();
});
