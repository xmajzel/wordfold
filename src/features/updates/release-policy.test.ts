import { isSnoozed, parseBuild, parsePolicy, REMIND_AFTER_MS, type ReleaseTarget, updateRequirement } from './release-policy';

const target: ReleaseTarget = { platform: 'android', channel: 'production', applicationId: 'com.jozefmajzel.wordfold', build: 5 };
const policy = { latest_build: 7, minimum_supported_build: 5, message: 'New features', store_url: 'https://play.google.com/store/apps/details?id=com.jozefmajzel.wordfold' };

describe('release policy', () => {
  it('compares numeric native builds and permits newer installations', () => {
    expect(updateRequirement(policy, 4)).toBe('required');
    expect(updateRequirement(policy, 5)).toBe('optional');
    expect(updateRequirement(policy, 7)).toBe('none');
    expect(updateRequirement(policy, 10)).toBe('none');
    expect(updateRequirement(null, 1)).toBe('none');
    expect(parseBuild('10')).toBe(10);
    for (const value of [null, '', '0', '1.2', 'NaN', 'Infinity', '9007199254740992']) expect(parseBuild(value)).toBeNull();
  });

  it('validates policy bounds and the destination store', () => {
    expect(parsePolicy(policy, target)).toEqual(policy);
    for (const fields of [
      { latest_build: 4 }, { latest_build: '7' }, { minimum_supported_build: 0 },
      { latest_build: Infinity }, { message: 'x'.repeat(501) },
      { store_url: 'https://example.com' },
      { store_url: 'https://play.google.com/store/apps/details?id=another.app' },
      { store_url: 'http://play.google.com/store/apps/details?id=com.jozefmajzel.wordfold' },
      { store_url: 'https://play.google.com.evil.example/store/apps/details?id=com.jozefmajzel.wordfold' },
    ]) expect(parsePolicy({ ...policy, ...fields }, target)).toBeNull();
    expect(parsePolicy(null, target)).toBeNull();
    expect(parsePolicy({ ...policy, store_url: 'https://apps.apple.com/us/app/wordfold/id123456' }, { ...target, platform: 'ios' })).not.toBeNull();
  });

  it('snoozes only the announced build for 24 hours and rejects future timestamps', () => {
    const snooze = { build: 7, at: 1000 };
    expect(isSnoozed(snooze, 7, 1000)).toBe(true);
    expect(isSnoozed(snooze, 8, 1000)).toBe(false);
    expect(isSnoozed(snooze, 7, 999)).toBe(false);
    expect(isSnoozed(snooze, 7, 1000 + REMIND_AFTER_MS)).toBe(false);
    expect(isSnoozed('invalid', 7, 1000)).toBe(false);
  });
});
