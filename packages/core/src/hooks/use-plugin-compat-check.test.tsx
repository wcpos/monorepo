/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { usePluginCompatCheck } from './use-plugin-compat-check';
import { MINIMUM_WCPOS_PLUGIN_VERSION } from '../utils/wcpos-plugin-version';

jest.mock('@wcpos/query/user-db', () => jest.requireActual('../../../query/src/user-db/sites'));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

const mockGet = jest.fn();
const mockHttp = { get: mockGet };
jest.mock('@wcpos/hooks/use-http-client', () => ({ useHttpClient: () => mockHttp }));

const mockError = jest.fn();
const mockWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	...jest.requireActual('@wcpos/utils/logger'),
	// Delegate lazily: the hook calls getLogger at module scope, before the spies exist.
	getLogger: () => ({
		error: (...args: unknown[]) => mockError(...args),
		warn: (...args: unknown[]) => mockWarn(...args),
		debug: () => undefined,
		info: () => undefined,
	}),
}));

const API_URL = 'https://store.example.test/wp-json/';

function makeSite(wcposVersion: string) {
	const state$ = new BehaviorSubject<Record<string, unknown>>({
		wp_api_url: API_URL,
		wcpos_version: wcposVersion,
		wcpos_pro_version: '',
	});
	const incrementalPatch = jest.fn(async (patch: Record<string, unknown>) => {
		state$.next({ ...state$.getValue(), ...patch });
	});
	const site = {
		wp_api_url: API_URL,
		$: state$,
		getLatest: () => ({ deleted: false }),
		incrementalPatch,
	};
	return { site: site as never, incrementalPatch };
}

const live = (wcposVersion: string) => ({ status: 200, data: { wcpos_version: wcposVersion } });

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

async function renderOutdated() {
	const { site, incrementalPatch } = makeSite('1.11.4');
	mockGet.mockResolvedValue(live('1.11.4'));
	const hook = renderHook(() => usePluginCompatCheck(site));
	await waitFor(() => expect(hook.result.current.status).toBe('outdated'));
	return { ...hook, incrementalPatch };
}

describe('usePluginCompatCheck', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('(a) trusts a saved supported version and asks the store nothing', () => {
		const { site } = makeSite('2.0.1');
		const { result } = renderHook(() => usePluginCompatCheck(site));

		expect(result.current.status).toBe('ok');
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('(b) shows no gate and asks nothing when no version is saved', () => {
		const { site } = makeSite('');
		const { result } = renderHook(() => usePluginCompatCheck(site));

		expect(result.current.status).toBe('ok');
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('(c) lets a stale saved 1.x through once the store reports 2.0.1, and saves the live version', async () => {
		const { site, incrementalPatch } = makeSite('1.11.4');
		const answer = deferred<ReturnType<typeof live>>();
		mockGet.mockReturnValue(answer.promise);

		const { result } = renderHook(() => usePluginCompatCheck(site));
		expect(result.current.status).toBe('checking');

		await act(async () => answer.resolve(live('2.0.1')));

		await waitFor(() => expect(result.current.status).toBe('ok'));
		expect(incrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({ wcpos_version: '2.0.1' })
		);
		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledWith(
			'Saved WCPOS plugin version was stale; the store reports a supported version',
			expect.objectContaining({ code: 'AUTH331' })
		);
		expect(mockError).not.toHaveBeenCalled();
	});

	it('(d) holds the gate when the live store is also 1.x, reporting it to Sentry once with the full context', async () => {
		await renderOutdated();

		expect(mockError).toHaveBeenCalledTimes(1);
		expect(mockError).toHaveBeenCalledWith('Store WCPOS plugin is older than this app requires', {
			code: 'AUTH331',
			context: {
				savedVersion: '1.11.4',
				savedProVersion: null,
				liveVersion: '1.11.4',
				liveProVersion: null,
				liveCheck: 'ok',
				minimumVersion: MINIMUM_WCPOS_PLUGIN_VERSION,
			},
		});
	});

	it('(e) holds the gate when the live check fails, leaving the saved record alone', async () => {
		const { site, incrementalPatch } = makeSite('1.11.4');
		mockGet.mockRejectedValue(new Error('Network Error'));

		const { result } = renderHook(() => usePluginCompatCheck(site));

		await waitFor(() => expect(result.current.status).toBe('outdated'));
		expect(mockError).toHaveBeenCalledTimes(1);
		expect(mockError.mock.calls[0]?.[1]).toMatchObject({
			context: { liveCheck: 'failed', liveVersion: null, liveProVersion: null },
		});
		expect(incrementalPatch).not.toHaveBeenCalled();
	});

	it('(f) Check again lifts the gate once the store reports a supported version', async () => {
		const { result, incrementalPatch } = await renderOutdated();
		incrementalPatch.mockClear();
		mockGet.mockResolvedValue(live('2.0.1'));

		act(() => result.current.recheck());

		await waitFor(() => expect(result.current.status).toBe('ok'));
		expect(incrementalPatch).toHaveBeenCalledWith(
			expect.objectContaining({ wcpos_version: '2.0.1' })
		);
	});

	it('(g) a re-render neither asks the store again nor reports again', async () => {
		const { rerender } = await renderOutdated();

		rerender();
		rerender();

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockError).toHaveBeenCalledTimes(1);
	});

	it('(h) Check again while a check is in flight makes no second request', async () => {
		const { site } = makeSite('1.11.4');
		const answer = deferred<ReturnType<typeof live>>();
		mockGet.mockReturnValue(answer.promise);
		const { result } = renderHook(() => usePluginCompatCheck(site));

		act(() => {
			result.current.recheck();
			result.current.recheck();
		});
		await act(async () => answer.resolve(live('1.11.4')));

		await waitFor(() => expect(result.current.status).toBe('outdated'));
		expect(mockGet).toHaveBeenCalledTimes(1);
	});

	it('(i) a check that answers after unmount reports nothing', async () => {
		const { site } = makeSite('1.11.4');
		const answer = deferred<ReturnType<typeof live>>();
		mockGet.mockReturnValue(answer.promise);
		const { unmount } = renderHook(() => usePluginCompatCheck(site));

		unmount();
		await act(async () => answer.resolve(live('1.11.4')));

		expect(mockError).not.toHaveBeenCalled();
		expect(mockWarn).not.toHaveBeenCalled();
	});
});
