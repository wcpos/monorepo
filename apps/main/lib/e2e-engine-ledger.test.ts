import type { SyncEvent } from '@wcpos/sync-core';

import { createE2eEngineLedgerObserver } from './e2e-engine-ledger';

// New-file collection under the jest-expo winter runtime requires this at module scope.
jest.resetModules();

type NativeLoggingGlobal = typeof globalThis & {
	nativeLoggingHook?: (line: string, level: number) => void;
};

const nativeGlobal = globalThis as NativeLoggingGlobal;
const originalFlag = process.env.EXPO_PUBLIC_WCPOS_E2E;
const originalHook = nativeGlobal.nativeLoggingHook;
const event = (partial: Partial<Omit<SyncEvent, 'type'>> & { type: string }): SyncEvent =>
	({ level: 'info', ...partial }) as SyncEvent;

describe('createE2eEngineLedgerObserver', () => {
	afterEach(() => {
		jest.restoreAllMocks();
		if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		else process.env.EXPO_PUBLIC_WCPOS_E2E = originalFlag;
		if (originalHook === undefined) delete nativeGlobal.nativeLoggingHook;
		else nativeGlobal.nativeLoggingHook = originalHook;
	});

	it('returns null when the E2E flag is unset', () => {
		delete process.env.EXPO_PUBLIC_WCPOS_E2E;

		expect(createE2eEngineLedgerObserver()).toBeNull();
	});

	it('emits one strictly allowlisted primitive payload per event', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const lines: { line: string; level: number }[] = [];
		nativeGlobal.nativeLoggingHook = (line, level) => lines.push({ line, level });
		const observer = createE2eEngineLedgerObserver();
		const prefix = 'WCPOS_E2E_ENGINE ';

		observer?.(
			event({
				type: 'transport.request',
				collection: 'orders',
				fields: {
					method: 'GET',
					path: '/wc/v3/orders',
					status: 200,
					durationMs: 12,
					bytes: 34,
					active: true,
					errorName: { nested: 'must-not-log' },
					requestUrl: 'https://user:secret@example.com/private',
					headers: { authorization: 'Bearer secret' },
				},
			})
		);
		observer?.(
			event({
				type: 'coverage.require.outcome',
				collection: 'products',
				fields: {
					requirementId: 'browse-products',
					kind: 'browse',
					action: 'fetched',
					documents: 12,
					requests: 2,
					durationMs: 34,
				},
			})
		);

		expect(lines).toHaveLength(2);
		expect(lines.every(({ line, level }) => line.startsWith(prefix) && level === 1)).toBe(true);
		expect(JSON.parse(lines[0].line.slice(prefix.length))).toEqual({
			type: 'transport.request',
			collection: 'orders',
			method: 'GET',
			path: '/wc/v3/orders',
			status: 200,
			durationMs: 12,
			bytes: 34,
			active: true,
		});
		expect(JSON.parse(lines[1].line.slice(prefix.length))).toEqual({
			type: 'coverage.require.outcome',
			collection: 'products',
			requirementId: 'browse-products',
			kind: 'browse',
			action: 'fetched',
			documents: 12,
			requests: 2,
			durationMs: 34,
		});
	});

	it('redacts credential-shaped values in every allowlisted string', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const lines: string[] = [];
		nativeGlobal.nativeLoggingHook = (line) => lines.push(line);

		createE2eEngineLedgerObserver()?.(
			event({
				type: 'coverage.require.error',
				fields: {
					path: 'https://cashier:secret@example.com/wp-json',
					errorDetail: 'request failed with token=plain-token',
				},
			})
		);

		const payload = JSON.parse(lines[0].slice('WCPOS_E2E_ENGINE '.length));
		expect(payload.path).toBe('https://[REDACTED]@example.com/wp-json');
		expect(payload.errorDetail).toBe('request failed with token=[REDACTED]');
	});

	it('derives the conformance error code for raw engine events', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const lines: string[] = [];
		nativeGlobal.nativeLoggingHook = (line) => lines.push(line);

		createE2eEngineLedgerObserver()?.(
			event({
				type: 'coverage.require.error',
				level: 'error',
				fields: { errorName: 'NetworkError' },
			})
		);

		expect(JSON.parse(lines[0].slice('WCPOS_E2E_ENGINE '.length))).toMatchObject({
			type: 'coverage.require.error',
			errorCode: 'SYNC321',
		});
	});

	it('masks a bare email in prose without re-mangling redacted URL credentials', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const lines: string[] = [];
		nativeGlobal.nativeLoggingHook = (line) => lines.push(line);

		createE2eEngineLedgerObserver()?.(
			event({
				type: 'coverage.require.error',
				fields: {
					errorDetail: 'request failed for cashier@example.com',
					path: 'https://cashier:secret@example.com/wp-json',
				},
			})
		);

		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain('cashier@example.com');
		const payload = JSON.parse(lines[0].slice('WCPOS_E2E_ENGINE '.length));
		expect(payload.errorDetail).toBe('request failed for [REDACTED]');
		expect(payload.path).toBe('https://[REDACTED]@example.com/wp-json');
	});

	it('falls back to console.warn when the native hook is unavailable', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		delete nativeGlobal.nativeLoggingHook;
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

		createE2eEngineLedgerObserver()?.(event({ type: 'engine.ready' }));

		expect(warn).toHaveBeenCalledWith('WCPOS_E2E_ENGINE {"type":"engine.ready"}');
	});

	it('swallows a native hook failure', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		nativeGlobal.nativeLoggingHook = () => {
			throw new Error('native logger unavailable');
		};
		const observer = createE2eEngineLedgerObserver();

		expect(() => observer?.(event({ type: 'engine.ready' }))).not.toThrow();
	});

	it('caps native log lines at 2000 characters while preserving valid JSON', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const lines: string[] = [];
		nativeGlobal.nativeLoggingHook = (line) => lines.push(line);

		createE2eEngineLedgerObserver()?.(
			event({ type: 'coverage.require.error', fields: { errorDetail: 'x'.repeat(3_000) } })
		);

		expect(lines).toHaveLength(1);
		expect(lines[0].length).toBeLessThanOrEqual(2_000);
		expect(() => JSON.parse(lines[0].slice('WCPOS_E2E_ENGINE '.length))).not.toThrow();
	});
});
