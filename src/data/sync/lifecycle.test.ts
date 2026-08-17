import { createSyncLifecycle } from './lifecycle';

describe('PowerSync account lifecycle', () => {
  it('connects on sign-in and clears before a subsequent account is connected', async () => {
    const events: string[] = [];
    const database = {
      connect: jest.fn(async () => { events.push('connect'); }),
      disconnectAndClear: jest.fn(async () => { events.push('clear'); }),
    };
    const lifecycle = createSyncLifecycle(database, {});

    await lifecycle.transitionTo('user-a');
    await lifecycle.transitionTo('user-b');

    expect(events).toEqual(['connect', 'clear', 'connect']);
  });

  it('serializes sign-out clearing behind an in-progress connection', async () => {
    const events: string[] = [];
    let finishConnection!: () => void;
    const connectionCanFinish = new Promise<void>((resolve) => { finishConnection = resolve; });
    const database = {
      connect: jest.fn(async () => {
        events.push('connect started');
        await connectionCanFinish;
        events.push('connect finished');
      }),
      disconnectAndClear: jest.fn(async () => { events.push('clear'); }),
    };
    const lifecycle = createSyncLifecycle(database, {});

    const connection = lifecycle.transitionTo('user-a');
    const clearing = lifecycle.clearBeforeSignOut();
    await Promise.resolve();
    expect(events).toEqual(['connect started']);

    finishConnection();
    await Promise.all([connection, clearing]);
    expect(events).toEqual(['connect started', 'connect finished', 'clear']);
  });

  it('clears stale synchronized data on a signed-out launch', async () => {
    const database = {
      connect: jest.fn(async () => undefined),
      disconnectAndClear: jest.fn(async () => undefined),
    };

    await createSyncLifecycle(database, {}).transitionTo(null);

    expect(database.disconnectAndClear).toHaveBeenCalledTimes(1);
    expect(database.connect).not.toHaveBeenCalled();
  });
});
