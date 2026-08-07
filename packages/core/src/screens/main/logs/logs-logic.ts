import type { LevelKind } from '../health/components/level-indicator';

/**
 * The plain-data shape of a log row as the ledger consumes it (schema v2,
 * spec §2). Structural on purpose: tests and derivations never need an RxDB
 * document.
 */
export type LogRow = {
	logId: string;
	timestamp: number;
	level?: string;
	message?: string;
	code?: string;
	category?: string;
	outcome?: string;
	operationId?: string;
	operationType?: string;
	requestId?: string;
	serverRequestId?: string;
	attempt?: number;
	durationMs?: number;
	count?: number;
	firstSeen?: number;
	lastSeen?: number;
	actor?: { id?: string; role?: string; name?: string } | null;
	context?: Record<string, unknown> | null;
};

/**
 * The stable engine event code the sync observer stamps on every row it writes
 * (`context.type`). It is the row's identity for support, export and the label
 * registry — the merchant-facing title is derived from it at render time and is
 * never persisted (#912).
 */
export function eventTypeOf(row: Pick<LogRow, 'context'>): string | undefined {
	const type = row.context?.type;
	return typeof type === 'string' && type.length > 0 ? type : undefined;
}

/** Every category the logger writes is `wcpos.<domain>…` — the prefix carries no signal on screen. */
export function displayCategory(category: string | undefined): string {
	if (!category) return '';
	return category.startsWith('wcpos.') ? category.slice('wcpos.'.length) : category;
}

const SYNC_CATEGORY_PREFIX = 'wcpos.sync';

function isSyncCategory(category: string | undefined): boolean {
	if (!category) return false;
	return category === SYNC_CATEGORY_PREFIX || category.startsWith(`${SYNC_CATEGORY_PREFIX}.`);
}

/**
 * Display kind for the LEVEL column. Severity wins; below that, an actor row
 * reads as an action and the sync domain reads as sync.
 */
export function displayKind(row: Pick<LogRow, 'level' | 'actor' | 'category'>): LevelKind {
	if (row.level === 'error') return 'error';
	if (row.level === 'warn') return 'warn';
	if (row.actor && (row.actor.id !== undefined || row.actor.name !== undefined)) return 'action';
	if (isSyncCategory(row.category)) return 'sync';
	if (row.level === 'debug') return 'debug';
	return 'info';
}

export type LogPreset = 'all' | 'actions' | 'errors' | 'sync';

export type LogPresetFilters = {
	level?: string[];
	category_prefix?: string;
	has_actor?: boolean;
};

/**
 * Preset chip → query-state filters. Debug rows only enter the ledger while
 * verbose diagnostics is on (they only persist then, too — spec §3).
 */
export function presetFilters(preset: LogPreset, verbose: boolean): LogPresetFilters {
	const levels = verbose ? ['debug', 'info', 'warn', 'error'] : ['info', 'warn', 'error'];
	switch (preset) {
		case 'all':
			return { level: levels };
		case 'actions':
			return { level: levels, has_actor: true };
		case 'errors':
			return { level: ['error'] };
		case 'sync':
			return { level: levels, category_prefix: SYNC_CATEGORY_PREFIX };
		default: {
			const exhaustive: never = preset;
			return exhaustive;
		}
	}
}

/**
 * Operation-chain edge marks: consecutive ledger rows sharing a real
 * `operationId` are one unit of work, so each row in a run of two or more gets
 * the chain edge. Storage never merges chains — this is display-only grouping
 * (spec §2, Paul's emphasis).
 */
export function chainMarkedIds(rows: Pick<LogRow, 'logId' | 'operationId'>[]): Set<string> {
	const marked = new Set<string>();
	let runStart = 0;
	for (let i = 1; i <= rows.length; i += 1) {
		const previous = rows[i - 1];
		const sameChain =
			i < rows.length &&
			rows[i].operationId !== undefined &&
			rows[i].operationId === previous.operationId;
		if (sameChain) continue;
		if (i - runStart > 1 && previous.operationId !== undefined) {
			for (let j = runStart; j < i; j += 1) marked.add(rows[j].logId);
		}
		runStart = i;
	}
	return marked;
}

export function formatDurationMs(durationMs: number | undefined): string | null {
	if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return null;
	if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
	if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
	const minutes = Math.floor(durationMs / 60_000);
	const seconds = Math.round((durationMs % 60_000) / 1_000);
	return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** Cadence between the last check and the next due one, for the status line. */
export function formatCadence(intervalMs: number): { value: number; unit: 's' | 'min' } | null {
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
	if (intervalMs < 90_000) return { value: Math.max(1, Math.round(intervalMs / 1_000)), unit: 's' };
	return { value: Math.max(1, Math.round(intervalMs / 60_000)), unit: 'min' };
}

/** Local-midnight boundary for the "today" stats. */
export function startOfLocalDay(nowMs: number): number {
	const date = new Date(nowMs);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

export type StuckRecord = {
	key: string;
	collection: string;
	recordId: string;
	reason: string;
	lastSeen: number;
	attempts: number;
	eventType: string | null;
	direction: 'push' | 'pull' | null;
	retryable: boolean;
};

const RETRYABLE_STUCK_EVENTS = new Set([
	'push.error',
	'push.in_progress',
	'queue.write.reschedule-failed',
]);

/**
 * Derived stuck-records view (spec §4): per (collection, record), the LATEST
 * decisive `sync.record` outcome wins — `failed`/`rejected` means stuck,
 * `ok`/`recovered` clears. `cancelled`/`unknown` rows are not evidence either
 * way. Rows must be sorted newest-first (the ledger's natural order).
 */
export function deriveStuckRecords(rows: LogRow[]): StuckRecord[] {
	const decided = new Map<string, StuckRecord | null>();
	for (const row of rows) {
		if (row.operationType !== 'sync.record') continue;
		const context = row.context ?? {};
		const recordId = context.recordId;
		if (recordId === undefined || recordId === null) continue;
		const collection = typeof context.collection === 'string' ? context.collection : '';
		const key = `${collection}:${String(recordId)}`;
		if (decided.has(key)) continue;
		if (row.outcome === 'failed' || row.outcome === 'rejected') {
			const eventType = typeof context.type === 'string' ? context.type : null;
			const direction =
				context.direction === 'push' || context.direction === 'pull' ? context.direction : null;
			const reason =
				typeof context.reason === 'string' && context.reason.length > 0
					? context.reason
					: (row.message ?? '');
			decided.set(key, {
				key,
				collection,
				recordId: String(recordId),
				reason,
				lastSeen: row.lastSeen ?? row.timestamp,
				attempts: row.count ?? 1,
				eventType,
				direction,
				retryable:
					direction === 'push' && eventType !== null && RETRYABLE_STUCK_EVENTS.has(eventType),
			});
		} else if (row.outcome === 'ok' || row.outcome === 'recovered') {
			decided.set(key, null);
		}
		// cancelled/unknown: leave undecided so an older decisive row can rule.
	}
	const stuck = [...decided.values()].filter((entry): entry is StuckRecord => entry !== null);
	return stuck.sort((a, b) => b.lastSeen - a.lastSeen);
}

export type ClockSkewWarning = {
	/** Signed; positive = server clock ahead of the device. */
	skewSeconds: number;
	/** When THIS skew value was measured — the row's own write time. */
	observedAt: number;
	/** Latest sighting of the same warning; ahead of `observedAt` when repeats collapsed. */
	lastSeen: number;
};

/**
 * The engine re-checks the clock once per store open, so a persistent
 * misconfiguration keeps writing fresh rows; a fixed clock ages out of the
 * panel within a day while the rows themselves stay in the ledger.
 */
const CLOCK_SKEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How far ahead of `nowMs` a row may sit and still count as current. Every
 * ledger timestamp is device-derived, so correcting a fast device clock
 * BACKWARD leaves rows dated in the future; without a lower bound their age is
 * negative and they would satisfy the window forever. A minute of slack absorbs
 * ordinary NTP slew — anything further ahead is a clock that has since been
 * corrected, which is exactly the warning that must expire.
 */
const CLOCK_SKEW_FUTURE_TOLERANCE_MS = 60 * 1000;

/**
 * Derived clock-skew view for the Database-tab callout: the freshest MEASURED
 * skew wins.
 *
 * Recency is judged on the row's own `timestamp`, not on `lastSeen`, because
 * `skewSeconds` lives in the row context and the logger's repeat-collapse
 * refreshes only `count`/`lastSeen`. A collapsed row therefore pairs a moving
 * `lastSeen` with the FIRST check's value, and reporting that pair could say
 * "server ahead" long after a later check found it behind. Ageing the value
 * from when it was actually measured keeps the callout no fresher than its
 * evidence — a still-skewed clock writes new rows anyway (collapse folds only
 * back-to-back identical writes, and sync logging lands in between).
 */
export function deriveClockSkew(rows: LogRow[], nowMs: number): ClockSkewWarning | null {
	let latest: ClockSkewWarning | null = null;
	for (const row of rows) {
		const skewSeconds = row.context?.skewSeconds;
		if (typeof skewSeconds !== 'number' || !Number.isFinite(skewSeconds) || skewSeconds === 0) {
			continue;
		}
		const observedAt = row.timestamp;
		const age = nowMs - observedAt;
		if (age > CLOCK_SKEW_WINDOW_MS || age < -CLOCK_SKEW_FUTURE_TOLERANCE_MS) continue;
		if (latest === null || observedAt > latest.observedAt) {
			latest = { skewSeconds, observedAt, lastSeen: Math.max(observedAt, row.lastSeen ?? 0) };
		}
	}
	return latest;
}

/**
 * Merchant-facing magnitude for the clock-skew callout. Skew below the
 * detector's 60 s threshold never reaches the ledger, so the floor is minutes;
 * seconds only appear for hand-written rows in tests.
 */
export function formatSkewMagnitude(skewSeconds: number): string {
	const seconds = Math.abs(Math.round(skewSeconds));
	if (seconds < 60) return `${seconds} s`;
	if (seconds < 2 * 3_600) return `${Math.round(seconds / 60)} min`;
	return `${(seconds / 3_600).toFixed(1)} h`;
}

/**
 * Correlation data for the expanded row detail. Raw values out — the component
 * owns locale-aware time formatting.
 */
export type RowDetailData = {
	/** e.g. `op_9d21 · sync.record` */
	operation?: string;
	/** e.g. `c41a88 · 400 · 500 ms` */
	request?: string;
	serverCode?: string;
	attempts?: { count: number; firstSeen: number; lastSeen: number };
};

export function rowDetailData(row: LogRow): RowDetailData {
	const context = row.context ?? {};
	const detail: RowDetailData = {};

	const operationParts = [row.operationId, row.operationType].filter(
		(part): part is string => typeof part === 'string' && part.length > 0
	);
	if (operationParts.length > 0) detail.operation = operationParts.join(' · ');

	const status = typeof context.status === 'number' ? String(context.status) : undefined;
	const requestParts = [
		row.requestId ?? row.serverRequestId,
		status,
		formatDurationMs(row.durationMs) ?? undefined,
	].filter((part): part is string => typeof part === 'string' && part.length > 0);
	if (requestParts.length > 0) detail.request = requestParts.join(' · ');

	const serverCode =
		typeof context.serverCode === 'string'
			? context.serverCode
			: typeof context.errorCode === 'string'
				? context.errorCode
				: undefined;
	if (serverCode) detail.serverCode = serverCode;

	const count = Math.max(row.count ?? 1, row.attempt ?? 0);
	if (count > 1) {
		detail.attempts = {
			count,
			firstSeen: row.firstSeen ?? row.timestamp,
			lastSeen: row.lastSeen ?? row.timestamp,
		};
	}
	return detail;
}

export type DebugInfoInput = {
	generatedAt: string;
	appVersion?: string;
	storeName?: string;
	connectivity: string;
	eventsToday: number;
	errorsToday: number;
	salesWaiting: number;
	stuckRecords: StuckRecord[];
	verboseDiagnostics: boolean;
	lastCheck: { atMs: number; status: string } | null;
	recentErrors: LogRow[];
};

/**
 * "Copy debug info" — the plain-text tier of export (spec §7). The ZIP bundle
 * is a later workstream; this summary must stand alone in a support thread.
 */
export function buildDebugInfo(input: DebugInfoInput): string {
	const lines: string[] = [];
	lines.push(`WCPOS debug info — ${input.generatedAt}`);
	if (input.appVersion) lines.push(`App version: ${input.appVersion}`);
	if (input.storeName) lines.push(`Store: ${input.storeName}`);
	lines.push(`Connectivity: ${input.connectivity}`);
	lines.push(
		`Last server check: ${
			input.lastCheck
				? `${new Date(input.lastCheck.atMs).toISOString()} (${input.lastCheck.status})`
				: 'none yet'
		}`
	);
	lines.push(`Events today: ${input.eventsToday}`);
	lines.push(`Errors today: ${input.errorsToday}`);
	lines.push(`Sales waiting to send: ${input.salesWaiting}`);
	lines.push(`Verbose diagnostics: ${input.verboseDiagnostics ? 'on' : 'off'}`);
	lines.push(`Stuck records: ${input.stuckRecords.length}`);
	for (const stuck of input.stuckRecords.slice(0, 10)) {
		lines.push(`  - ${stuck.collection}/${stuck.recordId}: ${stuck.reason} (×${stuck.attempts})`);
	}
	lines.push('');
	lines.push(`Recent errors (${input.recentErrors.length}):`);
	if (input.recentErrors.length === 0) {
		lines.push('  none');
	}
	for (const row of input.recentErrors) {
		// The raw event type rides the export even though the UI titles rows from
		// its translation: support greps these lines by code, and the translated
		// title is whatever language the till happened to be in.
		const parts = [
			new Date(row.timestamp).toISOString(),
			row.code ?? '-',
			displayCategory(row.category) || '-',
			eventTypeOf(row) ?? '-',
			row.message ?? '',
		];
		const suffix = (row.count ?? 1) > 1 ? ` (×${row.count})` : '';
		lines.push(`  - ${parts.join(' | ')}${suffix}`);
	}
	return lines.join('\n');
}
