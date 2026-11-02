import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

/**
 * Troubleshooting probe for the POS products grid: WHO re-renders after a sync, and WHY.
 *
 * Observed 2026-10-12: when the products' automatic sync finishes (the footer's spinner stops)
 * the product images visibly re-render. Nothing in the data path should move for an unchanged
 * catalogue (the pull skips unchanged documents, RxDB keeps the document instance, the image
 * resource is cached per URL), so this probe records the whole chain once a sync flips:
 *
 *   sync active ⇄ idle          → `markSyncActive` (the grid reads the handle snapshot's `active`)
 *   result emissions            → `logResultEmission`: identity/order/image-src diff per emission
 *   component renders           → `useRenderProbe`: mount, unmount, and which props changed
 *   image loads                 → `probeEvent`: Suspense fallbacks, load/display/error callbacks
 *
 * Every row is `debug`: console in development, the flight recorder in production
 * (`window.wcposLog.setVerbose(true)` persists them to the Logs screen). Rows are batched per
 * tick so a 50-tile grid writes one line per component per commit, not fifty. Each row carries
 * `sinceSyncMs` (ms since the sync state last flipped) and `emission` (the grid's result
 * emission counter) so renders can be tied to the sync phase that caused them.
 *
 * On in development bundles only: the rows are `debug`, which the logger also records into the
 * shared 100-event flight recorder in production, where a scrolled catalogue's image events would
 * evict the operational trail the recorder exists to keep. Set this to `true` to probe a
 * production bundle deliberately; set it to `false` to silence every call site.
 */
export const RENDER_PROBE_ENABLED: boolean = __DEV__;

const probe = getLogger(['wcpos', 'pos', 'products', 'render-probe']);

type Phase = { active: boolean; flippedAt: number; flips: number };
const phase: Phase = { active: false, flippedAt: Date.now(), flips: 0 };
let emission = 0;

function stamp(): {
	sinceSyncMs: number;
	syncActive: boolean;
	syncFlips: number;
	emission: number;
} {
	return {
		sinceSyncMs: Date.now() - phase.flippedAt,
		syncActive: phase.active,
		syncFlips: phase.flips,
		emission,
	};
}

/** The grid reports the snapshot's `active` here so every other row can be placed against it. */
export function markSyncActive(active: boolean): void {
	if (!RENDER_PROBE_ENABLED) return;
	if (active === phase.active && phase.flips > 0) return;
	// Rows queued under the old phase are written under it, before the stamp moves.
	flush();
	phase.active = active;
	phase.flippedAt = Date.now();
	phase.flips += 1;
	probe.debug(active ? 'sync became ACTIVE' : 'sync became IDLE', { context: stamp() });
}

/**
 * Any one-off observation (an image load, a Suspense fallback, a snapshot flag flip). Events
 * batch by name AND context, so `pending: true` then `pending: false` in one tick are two rows;
 * `id` names the subject and is collected per row rather than keyed.
 */
export function probeEvent(
	event: string,
	context: Record<string, unknown> = {},
	id?: string
): void {
	if (!RENDER_PROBE_ENABLED) return;
	const detail = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
	enqueue(`event:${event}${detail}`, context, id);
}

/**
 * Which props changed identity between two renders. `parent` means the component re-rendered
 * with every prop identical — its parent re-rendered and it is not memoised.
 */
export function diffProps(
	previous: Record<string, unknown> | null,
	next: Record<string, unknown>
): string[] {
	if (!previous) return ['mount'];
	const changed: string[] = [];
	for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
		if (!Object.is(previous[key], next[key])) changed.push(key);
	}
	return changed.length === 0 ? ['parent'] : changed;
}

type Hit = {
	id: string;
	record: {
		payload?: { images?: { src?: string }[] };
		toJSON?: (withMeta?: boolean) => Record<string, unknown>;
	};
};

const DOCUMENT_META_KEYS = new Set(['_rev', '_meta', '_attachments', '_deleted']);

/** Which top-level document fields (and which payload fields) differ between two instances. */
function changedFields(before: Hit, after: Hit): string[] {
	try {
		const previous = before.record.toJSON?.(true) ?? {};
		const next = after.record.toJSON?.(true) ?? {};
		const changed: string[] = [];
		for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
			if (DOCUMENT_META_KEYS.has(key)) continue;
			if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
			if (key === 'payload') {
				const previousPayload = (previous.payload ?? {}) as Record<string, unknown>;
				const nextPayload = (next.payload ?? {}) as Record<string, unknown>;
				for (const field of new Set([
					...Object.keys(previousPayload),
					...Object.keys(nextPayload),
				])) {
					if (JSON.stringify(previousPayload[field]) !== JSON.stringify(nextPayload[field]))
						changed.push(`payload.${field}`);
				}
			} else {
				changed.push(key);
			}
		}
		return changed.length === 0 ? ['(identical JSON)'] : changed;
	} catch {
		return ['(unreadable)'];
	}
}

/** A stale hit's payload getter throws (the grid skips it); read as "no image" here. */
function imageSrc(hit: Hit): string | undefined {
	try {
		return hit.record.payload?.images?.[0]?.src;
	} catch {
		return undefined;
	}
}

/** The diff between two result emissions the grid received. */
export function diffHits(
	previous: readonly Hit[] | null,
	next: readonly Hit[]
): {
	count: number;
	added: number;
	removed: number;
	moved: number;
	recordIdentityChanged: number;
	imageSrcChanged: number;
	/** How many rewritten records differed in each field; `(identical JSON)` = a no-op rewrite. */
	rewrittenFields: Record<string, number>;
	rewrittenSample: string[];
} {
	const prevById = new Map<string, { index: number; hit: Hit }>();
	(previous ?? []).forEach((hit, index) => prevById.set(hit.id, { index, hit }));
	let added = 0;
	let moved = 0;
	let recordIdentityChanged = 0;
	let imageSrcChanged = 0;
	const rewrittenFields: Record<string, number> = {};
	const rewrittenSample: string[] = [];
	next.forEach((hit, index) => {
		const before = prevById.get(hit.id);
		if (!before) {
			added += 1;
			return;
		}
		if (before.index !== index) moved += 1;
		if (before.hit.record !== hit.record) {
			recordIdentityChanged += 1;
			for (const field of changedFields(before.hit, hit)) {
				rewrittenFields[field] = (rewrittenFields[field] ?? 0) + 1;
			}
			if (rewrittenSample.length < IDS_PER_ROW) rewrittenSample.push(hit.id);
		}
		if (imageSrc(before.hit) !== imageSrc(hit)) imageSrcChanged += 1;
	});
	const nextIds = new Set(next.map((hit) => hit.id));
	const removed = (previous ?? []).filter((hit) => !nextIds.has(hit.id)).length;
	return {
		count: next.length,
		added,
		removed,
		moved,
		recordIdentityChanged,
		imageSrcChanged,
		rewrittenFields,
		rewrittenSample,
	};
}

/** Called by the grid for every result it is handed; returns the emission number for the row. */
export function logResultEmission(
	previous: readonly Hit[] | null,
	next: readonly Hit[],
	extra: Record<string, unknown> = {}
): number {
	if (!RENDER_PROBE_ENABLED) return emission;
	emission += 1;
	const diff = diffHits(previous, next);
	const quiet =
		previous !== null &&
		diff.added === 0 &&
		diff.removed === 0 &&
		diff.moved === 0 &&
		diff.recordIdentityChanged === 0 &&
		diff.imageSrcChanged === 0;
	probe.debug(quiet ? 'grid result emitted: NO CHANGE in hits' : 'grid result emitted', {
		context: { ...stamp(), ...diff, sameArray: previous === next, ...extra },
	});
	return emission;
}

// ---------------------------------------------------------------------------------------------
// Batched render rows: one line per (component, kind, reasons) per tick AND per stamp — a row is
// stamped when it is queued, so two commits landing before the zero-delay flush (a throttled
// background tab) never share a row or borrow the later commit's emission number.

type Stamp = ReturnType<typeof stamp>;
type Bucket = {
	key: string;
	times: number;
	ids: string[];
	context: Record<string, unknown>;
	at: Stamp;
};
const pending = new Map<string, Bucket>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const IDS_PER_ROW = 5;
/**
 * Rows queued within this window share a line. A commit's render rows land in one tick, but an
 * image's native load/display callbacks arrive in separate ticks per picture, so the window is
 * wide enough to fold a screen of pictures into one row per event, not one per picture. A sync
 * phase flip flushes first, so a window never straddles two phases.
 */
const BATCH_WINDOW_MS = 250;

function enqueue(key: string, context: Record<string, unknown>, id?: string): void {
	const at = stamp();
	const bucketKey = `${key}|${at.syncFlips}|${at.emission}`;
	const bucket = pending.get(bucketKey) ?? { key, times: 0, ids: [], context, at };
	bucket.times += 1;
	if (id && bucket.ids.length < IDS_PER_ROW) bucket.ids.push(id);
	pending.set(bucketKey, bucket);
	if (flushTimer === null) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
}

function flush(): void {
	if (flushTimer !== null) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	if (pending.size === 0) return;
	const rows = [...pending.values()];
	pending.clear();
	for (const bucket of rows) {
		probe.debug(`${bucket.key} ×${bucket.times}`, {
			context: { ...bucket.at, ...bucket.context, ids: bucket.ids },
		});
	}
}

/**
 * Record this component's mount, unmount, and every re-render with the props that changed.
 * Pass the values whose identity could plausibly drive a re-render (props, hook results).
 * Logged after commit, so a discarded render never counts.
 */
export function useRenderProbe(name: string, id: string, watched: Record<string, unknown>): void {
	const previous = React.useRef<Record<string, unknown> | null>(null);
	const renders = React.useRef(0);
	React.useEffect(() => {
		if (!RENDER_PROBE_ENABLED) return;
		renders.current += 1;
		const reasons = diffProps(previous.current, watched);
		previous.current = watched;
		const kind = reasons[0] === 'mount' ? 'mount' : 'render';
		enqueue(`${name} ${kind} [${reasons.join(',')}]`, {}, id);
	});
	React.useEffect(() => {
		if (!RENDER_PROBE_ENABLED) return;
		return () => {
			enqueue(`${name} unmount`, { rendersInLife: renders.current }, id);
		};
	}, [name, id]);
}

/** Mount this as a Suspense fallback (or anywhere) to log that it was shown. */
export function useMountProbe(event: string, id: string): void {
	React.useEffect(() => {
		if (!RENDER_PROBE_ENABLED) return;
		enqueue(`event:${event} shown`, {}, id);
		return () => enqueue(`event:${event} hidden`, {}, id);
	}, [event, id]);
}
