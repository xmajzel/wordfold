export const PRACTICE_DAYS_PER_TREE = 10;

export interface ProgressEvent {
  type: string;
  value: string | null;
  occurred_at: string;
  practice_date?: string | null;
  action_count?: number;
}

export interface GardenTree {
  ordinal: number;
  earnedOn: string;
  plantedAt: string;
}

export interface GardenProgress {
  practiceDays: number;
  practiceActions: number;
  currentStreak: number;
  personalBest: number;
  todayComplete: boolean;
  nextStreakMilestone: number;
  trees: GardenTree[];
  readyToPlant: number;
  daysTowardNextTree: number;
  activity: { date: string; count: number; future: boolean }[];
}

export function isPracticeEvent(type: string) {
  return type === 'rating' || type === 'game_answered' || type === 'game_missed';
}

export function localPracticeDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

// Older history has no original timezone. Its UTC dates are frozen by both
// migrations; new events retain the local date chosen at the time of practice.
export function eventPracticeDate(event: ProgressEvent) {
  const timestamp = new Date(event.occurred_at);
  const date = event.practice_date ?? (Number.isFinite(timestamp.getTime()) ? timestamp.toISOString().slice(0, 10) : null);
  return validDate(date) ? date : null;
}

export function summarizeGarden(events: readonly ProgressEvent[], now = new Date()): GardenProgress {
  const today = localPracticeDate(now);
  const counts = new Map<string, number>();
  const trees = new Map<number, GardenTree>();
  for (const event of events) {
    const date = eventPracticeDate(event);
    if (isPracticeEvent(event.type) && date && date <= today) {
      counts.set(date, (counts.get(date) ?? 0) + (event.action_count ?? 1));
    } else if (event.type === 'garden_tree' && date) {
      const ordinal = Number(event.value);
      if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isFinite(Date.parse(event.occurred_at))) continue;
      const tree = { ordinal, earnedOn: date, plantedAt: event.occurred_at };
      const existing = trees.get(ordinal);
      if (!existing || tree.plantedAt < existing.plantedAt) trees.set(ordinal, tree);
    }
  }
  const days = [...counts.keys()].sort();
  let personalBest = 0;
  let run = 0;
  days.forEach((day, index) => {
    run = index > 0 && shiftDay(days[index - 1], 1) === day ? run + 1 : 1;
    personalBest = Math.max(personalBest, run);
  });
  let currentStreak = 0;
  let cursor = counts.has(today) ? today : shiftDay(today, -1);
  while (counts.has(cursor)) { currentStreak += 1; cursor = shiftDay(cursor, -1); }
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = shiftDay(today, -((weekday + 6) % 7) - 84);
  const earned = Math.floor(days.length / PRACTICE_DAYS_PER_TREE);
  let readyToPlant = 0;
  for (let ordinal = 1; ordinal <= earned; ordinal += 1) if (!trees.has(ordinal)) readyToPlant += 1;
  return {
    practiceDays: days.length,
    practiceActions: [...counts.values()].reduce((sum, count) => sum + count, 0),
    currentStreak, personalBest, todayComplete: counts.has(today),
    nextStreakMilestone: [5, 10, 20, 30, 50, 100].find((day) => day > currentStreak) ?? (Math.floor(currentStreak / 100) + 1) * 100,
    trees: [...trees.values()].sort((a, b) => a.ordinal - b.ordinal),
    readyToPlant, daysTowardNextTree: days.length % PRACTICE_DAYS_PER_TREE,
    activity: Array.from({ length: 91 }, (_, index) => {
      const date = shiftDay(start, index);
      return { date, count: counts.get(date) ?? 0, future: date > today };
    }),
  };
}

export function nextGardenTree(events: readonly ProgressEvent[], now = new Date()): GardenTree | null {
  const progress = summarizeGarden(events, now);
  if (!progress.readyToPlant) return null;
  const planted = new Set(progress.trees.map((tree) => tree.ordinal));
  let ordinal = 1;
  while (planted.has(ordinal)) ordinal += 1;
  const dates = [...new Set(events.filter((event) => isPracticeEvent(event.type))
    .map(eventPracticeDate).filter((date): date is string => !!date && date <= localPracticeDate(now)))].sort();
  return { ordinal, earnedOn: dates[ordinal * PRACTICE_DAYS_PER_TREE - 1], plantedAt: now.toISOString() };
}
