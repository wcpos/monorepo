/**
 * The task-queue lock for the main process's filesystem-node storage.
 * rxdb-premium's filesystem-node plugin hands its TaskQueue the `web-locks` package as the lock, and
 * that package resolves `request()` whatever the callback did; this lock settles `request()` with
 * the callback's outcome, like `navigator.locks`. Exclusive per name, callbacks in arrival order.
 * Cross-process exclusion is not needed — the storage bridge is the one holder of these files.
 */
export function createStorageLock() {
  const tails = new Map();
  return {
    request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      if (!callback) return Promise.reject(new TypeError('storage lock: no callback'));
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(() => callback({ name, mode: 'exclusive' }));
      const settled = run.then(() => undefined, () => undefined);
      tails.set(name, settled);
      void settled.then(() => { if (tails.get(name) === settled) tails.delete(name); });
      return run;
    },
  };
}
