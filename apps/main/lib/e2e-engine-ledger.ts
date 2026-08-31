import type { SyncObserver } from '@wcpos/sync-core';

const PREFIX = 'WCPOS_E2E_ENGINE ';
const MAX_LINE_LENGTH = 2_000;
const FIELD_ALLOWLIST = [
	'type',
	'collection',
	'requirementId',
	'kind',
	'method',
	'path',
	'status',
	'durationMs',
	'bytes',
	'outcome',
	'errorName',
	'errorCode',
	'errorDetail',
	'active',
	'count',
	'timedOut',
	'attempt',
] as const;

type LedgerValue = string | number | boolean;
type NativeLoggingGlobal = typeof globalThis & { nativeLoggingHook?: unknown };

export function createE2eEngineLedgerObserver(): SyncObserver | null {
	if (process.env.EXPO_PUBLIC_WCPOS_E2E !== '1') return null;

	return (event) => {
		try {
			const fields = (event.fields ?? {}) as Readonly<Record<string, unknown>>;
			const payload: Record<string, LedgerValue> = {};
			for (const key of FIELD_ALLOWLIST) {
				const value = key === 'type' || key === 'collection' ? event[key] : fields[key];
				if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
					payload[key] = value;
				}
			}
			const line = `${PREFIX}${JSON.stringify(payload)}`.slice(0, MAX_LINE_LENGTH);
			const hook = (globalThis as NativeLoggingGlobal).nativeLoggingHook;
			if (typeof hook === 'function') hook(line, 1);
			else console.warn(line);
		} catch {
			// E2E diagnostics are best-effort and must never affect the sync engine.
		}
	};
}
