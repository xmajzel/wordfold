import { createSerialMutationQueue } from './mutation-queue';

describe('learning mutation queue', () => {
  it('does not overlap view and rating writes', async () => {
    const queue = createSerialMutationQueue();
    const events: string[] = [];
    let activeMutations = 0;
    let maxActiveMutations = 0;
    let releaseView!: () => void;
    const viewCanFinish = new Promise<void>((resolve) => {
      releaseView = resolve;
    });

    const viewWrite = queue.run(async () => {
      events.push('view started');
      activeMutations += 1;
      maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
      await viewCanFinish;
      activeMutations -= 1;
      events.push('view finished');
    });
    const ratingWrite = queue.run(async () => {
      events.push('rating started');
      activeMutations += 1;
      maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
      activeMutations -= 1;
      events.push('rating finished');
    });

    await Promise.resolve();
    expect(events).toEqual(['view started']);

    releaseView();
    await Promise.all([viewWrite, ratingWrite]);

    expect(maxActiveMutations).toBe(1);
    expect(events).toEqual(['view started', 'view finished', 'rating started', 'rating finished']);
  });

  it('continues after a failed mutation', async () => {
    const queue = createSerialMutationQueue();
    const failedWrite = queue.run(async () => {
      throw new Error('view write failed');
    });
    const nextWrite = queue.run(async () => 'rating saved');

    await expect(failedWrite).rejects.toThrow('view write failed');
    await expect(nextWrite).resolves.toBe('rating saved');
  });
});
