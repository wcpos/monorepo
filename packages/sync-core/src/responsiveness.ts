/**
 * UI-responsiveness recorder core (docs/wcpos-pain-points.md, pain point 1).
 *
 * The metric that transfers across platforms is UI-thread blocking time, not
 * "uses a worker". This module samples main-thread blocking (longtask entries
 * plus requestAnimationFrame gaps) so storage backends can be compared on the
 * same axis from any host (web lab, Electron playground). The workloads and
 * the backend x workload suite that drive this sampler are instrumentation —
 * they live in ./bench/responsivenessBench ('@woo-rxdb-lab/sync-core/bench').
 */

export const FRAME_GAP_THRESHOLD_MS = 50;

export type ResponsivenessMetrics = {
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  frameGapCount: number;
  frameGapMaxMs: number;
  sampledMs: number;
  /** False when sampled in a hidden page — frame-gap fields are then meaningless; longtask fields remain valid. */
  pageVisible: boolean | null;
};

type LongTaskEntryLike = { duration: number };

type LongTaskListLike = { getEntries(): LongTaskEntryLike[] };

export type PerformanceObserverLike = {
  observe(options: { type?: string; entryTypes?: string[]; buffered?: boolean }): void;
  disconnect(): void;
  takeRecords?(): LongTaskEntryLike[];
};

export type PerformanceObserverCtorLike = {
  new (callback: (list: LongTaskListLike) => void): PerformanceObserverLike;
  supportedEntryTypes?: readonly string[];
};

export type ResponsivenessSamplerDeps = {
  now?: () => number;
  requestAnimationFrame?: (callback: () => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  /**
   * Long-task observer constructor. Defaults to the global PerformanceObserver
   * when it supports the 'longtask' entry type (jsdom does not — guarded).
   * Pass null to disable long-task observation explicitly.
   */
  performanceObserverCtor?: PerformanceObserverCtorLike | null;
};

export type ResponsivenessSampler = {
  stop(): ResponsivenessMetrics;
};

function resolveLongTaskObserver(
  ctorOverride: PerformanceObserverCtorLike | null | undefined,
  onEntries: (entries: LongTaskEntryLike[]) => void,
): PerformanceObserverLike | null {
  const ctor = ctorOverride === undefined
    ? (globalThis as { PerformanceObserver?: PerformanceObserverCtorLike }).PerformanceObserver ?? null
    : ctorOverride;
  if (!ctor) {
    return null;
  }
  if (ctor.supportedEntryTypes && !ctor.supportedEntryTypes.includes('longtask')) {
    return null;
  }
  try {
    const observer = new ctor((list) => onEntries(list.getEntries()));
    observer.observe({ type: 'longtask', buffered: false });
    return observer;
  } catch {
    return null;
  }
}

/**
 * RxDB schedules parts of database/collection creation on requestIdleCallback,
 * which never fires in a hidden page (automation, background tabs) — database
 * creation then hangs forever. When the page is hidden, route idle callbacks
 * through setTimeout so automated runs proceed. Frame-gap metrics are
 * meaningless without paints; longtask metrics stay valid (main-thread
 * occupancy is observed regardless of visibility), so hidden runs still
 * measure the pain-point-1 metric honestly — see `pageVisible` in the result.
 */
export function installHiddenPageIdlePolyfill(doc: { hidden: boolean } = document, win: typeof globalThis = globalThis): boolean {
  if (!doc.hidden) {
    return false;
  }
  const target = win as unknown as {
    requestIdleCallback?: (cb: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void, opts?: { timeout?: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
    queueMicrotask?: (cb: () => void) => void;
  };
  const native = target.requestIdleCallback?.bind(win);
  const nativeCancel = target.cancelIdleCallback?.bind(win);
  if (native && nativeRicByWin.has(win)) {
    return true; // already installed for this window — keep the original native
  }
  nativeRicByWin.set(win, true);
  // Hidden pages clamp timers (Chromium: 1/sec, then 1/min under intensive
  // throttling) AND requestIdleCallback — the timeout option does not punch
  // through, and RxDB chains every idle wait through one global promise
  // queue, so a single stuck entry hangs all later DB/collection creation.
  // Microtasks are never throttled. Dispatch on visibility AT CALL TIME:
  // visible pages keep real idle semantics via the captured native callback,
  // hidden pages get the unthrottled microtask path. Synthetic handles start
  // far above any realistic native handle so cancellation can tell the two
  // spaces apart.
  const cancelled = new Set<number>();
  let nextHandle = 2 ** 30;
  const schedule = target.queueMicrotask ?? ((cb: () => void) => void Promise.resolve().then(cb));
  target.requestIdleCallback = (cb, opts) => {
    if (!doc.hidden && native) {
      return native(cb, opts);
    }
    const handle = nextHandle++;
    schedule(() => {
      if (!cancelled.delete(handle)) {
        cb({ didTimeout: true, timeRemaining: () => 50 });
      }
    });
    return handle;
  };
  target.cancelIdleCallback = (handle) => {
    if (handle >= 2 ** 30) {
      cancelled.add(handle);
      return;
    }
    nativeCancel?.(handle);
  };
  return true;
}

/** One install per window: re-installing would capture our own shim as "native". */
const nativeRicByWin = new WeakMap<object, true>();

export function startResponsivenessSampler(deps: ResponsivenessSamplerDeps = {}): ResponsivenessSampler {
  const now = deps.now ?? (() => performance.now());
  const raf = deps.requestAnimationFrame
    ?? (typeof requestAnimationFrame === 'function' ? (callback: () => void): number => requestAnimationFrame(() => callback()) : undefined);
  const caf = deps.cancelAnimationFrame
    ?? (typeof cancelAnimationFrame === 'function' ? (handle: number): void => cancelAnimationFrame(handle) : undefined);

  const startedAt = now();
  let lastFrameAt = startedAt;
  let frameGapCount = 0;
  let frameGapMaxMs = 0;
  let longTaskCount = 0;
  let longTaskTotalMs = 0;
  let longTaskMaxMs = 0;
  let stopped = false;
  let rafHandle: number | null = null;
  let finalMetrics: ResponsivenessMetrics | null = null;

  const recordGap = (frameAt: number): void => {
    const gap = frameAt - lastFrameAt;
    if (gap > FRAME_GAP_THRESHOLD_MS) {
      frameGapCount += 1;
      frameGapMaxMs = Math.max(frameGapMaxMs, gap);
    }
    lastFrameAt = frameAt;
  };

  const onFrame = (): void => {
    if (stopped) {
      return;
    }
    recordGap(now());
    rafHandle = raf ? raf(onFrame) : null;
  };
  rafHandle = raf ? raf(onFrame) : null;

  const recordLongTasks = (entries: LongTaskEntryLike[]): void => {
    for (const entry of entries) {
      longTaskCount += 1;
      longTaskTotalMs += entry.duration;
      longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration);
    }
  };
  const observer = resolveLongTaskObserver(deps.performanceObserverCtor, recordLongTasks);

  return {
    stop(): ResponsivenessMetrics {
      if (finalMetrics) {
        return finalMetrics;
      }
      stopped = true;
      if (rafHandle !== null && caf) {
        caf(rafHandle);
      }
      const stoppedAt = now();
      // A workload that blocked right up to stop() never lets the next frame
      // fire, so the trailing blocked window is measured here.
      recordGap(stoppedAt);
      if (observer) {
        recordLongTasks(observer.takeRecords?.() ?? []);
        observer.disconnect();
      }
      finalMetrics = {
        longTaskCount,
        longTaskTotalMs,
        longTaskMaxMs,
        frameGapCount,
        frameGapMaxMs,
        sampledMs: stoppedAt - startedAt,
        pageVisible: typeof document === 'undefined' ? null : !document.hidden,
      };
      return finalMetrics;
    },
  };
}

// The workload/suite/markdown INSTRUMENT built on this sampler lives in
// ./bench/responsivenessBench — import it from '@woo-rxdb-lab/sync-core/bench'.
// This module keeps only the engine: the sampler and the hidden-page polyfill.
