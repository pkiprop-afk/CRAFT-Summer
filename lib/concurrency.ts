export interface ConcurrencyOptions<T> {
  /**
   * Called before each item is dispatched. Returning false stops the run
   * cleanly: in-flight work finishes, nothing further is started, and the
   * indices never dispatched are reported.
   *
   * Used for the mid-batch callability check — a balance that empties partway
   * through must halt the run rather than accumulate failures.
   *
   * Being async, this can overshoot: while it is awaited, other workers may
   * claim further indices, so up to `limit - 1` extra items can start. That is
   * harmless for a halt, which has no need to land on a particular boundary.
   * It is NOT acceptable for a checkpoint — use shouldDispatch for that.
   */
  shouldContinue?: (completed: number) => Promise<boolean> | boolean;
  /**
   * Synchronous dispatch gate, consulted with the index about to be claimed.
   * Returning false stops the run before that index is dispatched.
   *
   * Deliberately synchronous: it is evaluated in the same uninterrupted step as
   * the cursor increment, so no other worker can slip past the boundary while
   * it is being decided. An async gate cannot give that guarantee — the await
   * is a yield point, and two workers can both read the same cursor before
   * either claims it.
   *
   * This is what makes a checkpoint exact: the dispatched set is always exactly
   * the prefix below the boundary, whatever the concurrency limit.
   */
  shouldDispatch?: (nextIndex: number) => boolean;
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
    if (cursor >= items.length) return;

    if (options.shouldContinue && !(await options.shouldContinue(completed))) {
      aborted = true;
      return;
    }

    // Re-read state after the await above: another worker may have aborted the
    // run or drained the queue while this one was suspended.
    if (aborted) return;
    if (cursor >= items.length) return;

    // The gate and the claim are one synchronous step — nothing may be awaited
    // between them, or the boundary leaks.
    if (options.shouldDispatch && !options.shouldDispatch(cursor)) {
      aborted = true;
      return;
    }
    const index = cursor++;

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
