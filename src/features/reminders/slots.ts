export const REMINDER_PRESETS = [
  { count: 1, label: 'One small spark', description: 'A single word in the middle of your window' },
  { count: 2, label: 'A steady pair', description: 'One at each edge of your window' },
  { count: 3, label: 'Triple practice', description: 'Start, middle, and finish' },
] as const;

function roundToFive(minutes: number) {
  return Math.round(minutes / 5) * 5;
}

export function calculateReminderSlots(startMinutes: number, endMinutes: number, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw new Error('Reminder count must be between 1 and 6');
  }
  if (startMinutes < 0 || endMinutes > 24 * 60 || startMinutes >= endMinutes) {
    throw new Error('Reminder window is invalid');
  }
  if (count === 1) return [roundToFive((startMinutes + endMinutes) / 2)];

  const interval = (endMinutes - startMinutes) / (count - 1);
  const slots = Array.from({ length: count }, (_, index) => roundToFive(startMinutes + interval * index));
  if (new Set(slots).size !== slots.length) {
    throw new Error('Reminder window is too small for this many reminders');
  }
  return slots;
}

export function formatMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, '0');
  const minute = (minutes % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}
