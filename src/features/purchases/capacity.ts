export const FREE_WORD_LIMIT = 100;
export const WORD_CAPACITY_NOTICE_THRESHOLDS = [75, 90] as const;

export class WordCapacityExceededError extends Error {
  constructor(
    public readonly currentCount: number,
    public readonly requestedCount: number,
    public readonly limit = FREE_WORD_LIMIT,
  ) {
    const remaining = Math.max(0, limit - currentCount);
    super(remaining === 0
      ? `Your free library includes ${limit} words. Unlock unlimited words to add more.`
      : `You can add ${remaining} more ${remaining === 1 ? 'word' : 'words'} for free. Unlock unlimited words to add this batch.`);
    this.name = 'WordCapacityExceededError';
  }

  get remaining() {
    return Math.max(0, this.limit - this.currentCount);
  }
}

export function assertWordCapacity(
  currentCount: number,
  requestedCount: number,
  unlimited: boolean,
) {
  if (unlimited || requestedCount <= 0) return;
  if (currentCount + requestedCount > FREE_WORD_LIMIT) {
    throw new WordCapacityExceededError(currentCount, requestedCount);
  }
}

export function getWordCapacity(currentCount: number, unlimited: boolean) {
  return {
    limit: FREE_WORD_LIMIT,
    count: currentCount,
    remaining: unlimited ? null : Math.max(0, FREE_WORD_LIMIT - currentCount),
    unlimited,
    shouldShowNotice: !unlimited && currentCount >= WORD_CAPACITY_NOTICE_THRESHOLDS[0],
  };
}
