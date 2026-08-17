import { calculateReminderSlots, formatMinutes } from './slots';

describe('reminder slots', () => {
  it('places one reminder at the midpoint', () => {
    expect(calculateReminderSlots(10 * 60, 20 * 60, 1)).toEqual([15 * 60]);
  });

  it('includes both endpoints for multiple reminders', () => {
    expect(calculateReminderSlots(10 * 60, 20 * 60, 3).map(formatMinutes)).toEqual([
      '10:00', '15:00', '20:00',
    ]);
  });

  it('rejects invalid windows', () => {
    expect(() => calculateReminderSlots(600, 600, 2)).toThrow('Reminder window is invalid');
  });
});
