import type { SyncObserver } from '@wcpos/sync-core';
import { redactSensitiveText } from '@wcpos/utils/logger';

import { resolveSyncEventErrorCode } from './sync-log-observer';

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
	'action',
	'documents',
	'requests',
	'errorName',
	'errorDetail',
	'active',
	'count',
	'timedOut',
	'attempt',
] as const;

type LedgerValue = string | number | boolean;
type NativeLoggingGlobal = typeof globalThis & { nativeLoggingHook?: unknown };

/** Serialize a ledger payload within the native log line limit without cutting JSON syntax. */
function serializePayload(payload: Record<string, LedgerValue>): string {
	let serialized = JSON.stringify(payload);
	while (PREFIX.length + serialized.length > MAX_LINE_LENGTH) {
		let longestKey: string | undefined;
		for (const [key, value] of Object.entries(payload)) {
			if (
				typeof value === 'string' &&
				(longestKey === undefined || value.length > String(payload[longestKey]).length)
			) {
				longestKey = key;
			}
		}
		if (longestKey === undefined) return '{}';
		const value = String(payload[longestKey]);
		const excess = PREFIX.length + serialized.length - MAX_LINE_LENGTH;
		if (value.length <= excess) delete payload[longestKey];
		else payload[longestKey] = `${value.slice(0, value.length - excess - 1)}…`;
		serialized = JSON.stringify(payload);
	}
	return serialized;
}

/** Create the opt-in, best-effort native E2E sync-event ledger observer. */
export function createE2eEngineLedgerObserver(): SyncObserver | null {
	if (process.env.EXPO_PUBLIC_WCPOS_E2E !== '1') return null;

	return (event) => {
		try {
			const fields = (event.fields ?? {}) as Readonly<Record<string, unknown>>;
			const payload: Record<string, LedgerValue> = {};
			for (const key of FIELD_ALLOWLIST) {
				const value = key === 'type' || key === 'collection' ? event[key] : fields[key];
				if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
					payload[key] = typeof value === 'string' ? redactSensitiveText(value) : value;
				}
			}
			const errorCode = resolveSyncEventErrorCode(event);
			if (errorCode !== null) payload.errorCode = errorCode;
			const line = `${PREFIX}${serializePayload(payload)}`;
			const hook = (globalThis as NativeLoggingGlobal).nativeLoggingHook;
			if (typeof hook === 'function') hook(line, 1);
			else console.warn(line);
		} catch {
			// E2E diagnostics are best-effort and must never affect the sync engine.
		}
	};
}
