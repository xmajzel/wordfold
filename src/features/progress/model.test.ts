import { localPracticeDate, nextGardenTree, summarizeGarden, type ProgressEvent } from './model';

const now = new Date('2026-09-30T12:00:00Z');
const rating = (day: string, type = 'rating'): ProgressEvent => ({ type, value: 'understood', occurred_at: `${day}T10:00:00Z`, practice_date: day });
const tenDays = Array.from({ length: 10 }, (_, i) => rating(`2026-09-${21 + i}`));

describe('Word garden progress', () => {
  it('welcomes a new learner without a streak or an unearned tree', () => {
    expect(summarizeGarden([], now)).toMatchObject({ practiceDays: 0, currentStreak: 0, personalBest: 0, readyToPlant: 0, trees: [] });
    expect(nextGardenTree([], now)).toBeNull();
  });
  it('uses the same deliberate events for dates, streaks, rewards and calendar counts', () => {
    const progress = summarizeGarden([rating('2026-09-28', 'view'), rating('2026-09-29', 'game_seen'), rating('2026-09-29', 'game_relearned'), rating('2026-09-30'), rating('2026-09-30', 'game_missed'), rating('2026-09-30', 'game_answered')], now);
    expect(progress).toMatchObject({ practiceDays: 1, practiceActions: 3, currentStreak: 1, personalBest: 1, todayComplete: true });
    expect(progress.activity.find((day) => day.date === '2026-09-30')?.count).toBe(3);
  });
  it('keeps yesterday’s streak available until today ends, then welcomes a return', () => {
    expect(summarizeGarden(tenDays, new Date('2026-10-01T12:00:00Z')).currentStreak).toBe(10);
    expect(summarizeGarden(tenDays, new Date('2026-10-02T12:00:00Z'))).toMatchObject({ currentStreak: 0, personalBest: 10, practiceDays: 10, readyToPlant: 1 });
  });
  it('earns from accumulated days even with breaks, once per ten distinct dates', () => {
    const events = tenDays.map((event, index) => ({ ...event, practice_date: `2026-09-${String(2 * index + 1).padStart(2, '0')}` }));
    const tree = nextGardenTree([...events, ...events], now)!;
    expect(tree).toEqual({ ordinal: 1, earnedOn: '2026-09-19', plantedAt: now.toISOString() });
    const claimed = [...events, { type: 'garden_tree', value: '1', occurred_at: now.toISOString(), practice_date: tree.earnedOn }];
    expect(nextGardenTree(claimed, now)).toBeNull();
    expect(summarizeGarden(claimed, new Date('2026-12-01T12:00:00Z')).trees).toEqual([tree]);
  });
  it('retains saved dates across timezone changes and uses UTC for legacy history', () => {
    const events = [{ ...rating('2026-09-29'), occurred_at: '2026-09-30T00:30:00Z' }, { ...rating('2026-09-30'), practice_date: null }];
    const progress = summarizeGarden(events, now);
    expect(progress.practiceDays).toBe(2);
    expect(progress.currentStreak).toBe(2);
    expect(localPracticeDate(new Date(2026, 8, 30, 0, 5))).toBe('2026-09-30');
  });
  it('shows 13 Monday-first weeks and excludes future or invalid dates', () => {
    const progress = summarizeGarden([rating('2026-10-01'), rating('2026-02-30')], now);
    expect(progress.practiceDays).toBe(0);
    expect(progress.activity).toHaveLength(91);
    expect(new Date(`${progress.activity[0].date}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(progress.activity.filter((day) => day.future)).toHaveLength(4);
  });
  it('deduplicates offline claims for one milestone and preserves the first planting story', () => {
    const progress = summarizeGarden([{ type: 'garden_tree', value: '1', occurred_at: '2026-09-30T12:00:00Z', practice_date: '2026-09-30' }, { type: 'garden_tree', value: '1', occurred_at: '2026-09-30T10:00:00Z', practice_date: '2026-09-29' }], now);
    expect(progress.trees).toEqual([{ ordinal: 1, plantedAt: '2026-09-30T10:00:00Z', earnedOn: '2026-09-29' }]);
  });
});
