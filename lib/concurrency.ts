export interface ConcurrencyOptions<T> {
  /**
   * Called before each item is dispatched. Returning false stops the run
   * cleanly: in-flight work finishes, nothing further is started, and the
   * indices never dispatched are reported.
   *
   * Used for the mid-batch callability check — a balance that empties partway
   * through must halt the run rather than accumulate failures.
   */
  shouldContinue?: (completed: number) => Promise<boolean> | boolean;
  onSkipped?: (index: number, item: T) => void;
}

export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  options: ConcurrencyOptions<T> = {}
): Promise<{ completed: number; aborted: boolean }> {
  let cursor = 0;
  let completed = 0;
  let aborted = false;

  async function runNext(): Promise<void> {
    if (aborted) return;

    if (options.shouldContinue && !(await options.shouldContinue(completed))) {
      aborted = true;
      return;
    }

    const index = cursor++;
    if (index >= items.length) return;

    await worker(items[index], index);
    completed++;
    await runNext();
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  if (aborted && options.onSkipped) {
    for (let i = cursor; i < items.length; i++) options.onSkipped(i, items[i]);
  }

  return { completed, aborted };
}
