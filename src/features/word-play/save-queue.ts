import type { WordPlayEvent } from './model';

/** Retains failed events and their identity until an explicit retry succeeds. */
export class WordPlaySaveQueue {
  private events: WordPlayEvent[] = [];
  private queued = new Set<string>();
  private running: Promise<void> | null = null;
  private failed = false;

  private listener: ((failed: boolean) => void) | null = null;

  constructor(
    private save: (event: WordPlayEvent) => Promise<void>,
    private onDetachedFailure: (retry: () => Promise<void>) => void,
  ) {}

  subscribe(listener: (failed: boolean) => void) {
    this.listener = listener;
    listener(this.failed);
    return () => {
      this.listener = null;
      if (this.failed) this.onDetachedFailure(() => this.retry());
    };
  }

  enqueue(event: WordPlayEvent) {
    if (this.queued.has(event.id)) return;
    this.queued.add(event.id);
    this.events.push(event);
    if (!this.failed) void this.flush().catch(() => undefined);
  }

  retry() {
    this.failed = false;
    return this.flush();
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.failed) return Promise.reject(new Error('Retry saving your game progress first.'));
    // Start in a microtask so the running guard is installed even if save throws.
    this.running = Promise.resolve().then(async () => {
      while (this.events.length) {
        await this.save(this.events[0]);
        this.events.shift();
      }
      this.listener?.(false);
    }).catch((error: unknown) => {
      this.failed = true;
      if (this.listener) this.listener(true);
      else this.onDetachedFailure(() => this.retry());
      throw error;
    }).finally(() => {
      this.running = null;
      if (this.events.length && !this.failed) void this.flush().catch(() => undefined);
    });
    return this.running;
  }
}
