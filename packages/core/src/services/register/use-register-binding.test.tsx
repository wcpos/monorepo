/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { getLogger } from '@wcpos/utils/logger';
import type { UserDatabase } from '@wcpos/database';
import {
	bindRegister,
	ensureRegister,
	readBoundRegister,
	readRegister,
} from '@wcpos/query/register-session';

import {
	useRegisterBinding,
	useRegisterBindingSession,
	useRegisterDirectory,
} from './use-register-binding';
import { useRegisterNames } from './use-register-names';

let mockStatus = 'online-website-available';
let mockDB: UserDatabase;
let mockSite = '';
let mockStoreId = 2;
const logger = jest.mocked(getLogger(['wcpos', 'register']));
// The real adoption by default; one test makes the local write fail after a good store read.
const mockAdoptCounters = jest.fn();
jest.mock('@wcpos/query/register-session', () => {
	const actual = jest.requireActual('@wcpos/query/register-session');
	return { ...actual, adoptCounters: (...args: unknown[]) => mockAdoptCounters(...args) };
});
const mockHttp = { get: jest.fn() };
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => ({
		wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
		userDB: mockDB,
		site: { uuid: mockSite },
		store: { id: mockStoreId },
	}),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));
addRxPlugin(RxDBLocalDocumentsPlugin);
beforeEach(async () => {
	jest.clearAllMocks();
	mockSite = 'site' + Math.random().toString(36).slice(2);
	mockDB = await createRxDatabase({
		name: mockSite,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	await ensureRegister(mockDB);
	mockStatus = 'online-website-available';
	mockStoreId = 2;
	mockHttp.get.mockReset();
	mockAdoptCounters.mockImplementation(
		jest.requireActual('@wcpos/query/register-session').adoptCounters
	);
});
afterEach(async () => {
	await mockDB.remove();
});
// Rows as the plugin sends them on `next`: no status column (woocommerce-pos#2350).
const rows = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
function mount() {
	return renderHook(() => {
		useRegisterBindingSession();
		return useRegisterBinding();
	});
}
// The server lists live registers only (a retired one is gone from the list on the plugin side).
it('silently binds the sole register the store lists and filters by store', async () => {
	const row = {
		...rows[0],
		session: {
			id: 'session-1',
			status: 'open',
			opened_at_gmt: '2026-10-21T08:15:00Z',
			opened_by: { id: 7, name: 'Pat' },
		},
		last_closure: { number: 12, closed_at_gmt: '2026-10-20T16:30:00Z' },
	};
	mockHttp.get.mockResolvedValue({
		data: [row],
	});
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'a', name: 'a' });
	expect(mockHttp.get).toHaveBeenCalledWith('registers', { params: { store_id: 2 } });
	expect(view.result.current.registers).toHaveLength(1);
	expect(view.result.current.registers[0]).toEqual(row);
	expect(logger.info).toHaveBeenCalledWith('Register bound automatically', {
		terminal: { operationId: 'a' },
		context: { type: 'register.bound', registerId: 'a', previousRegisterId: null },
	});
	expect(logger.info.mock.calls[0][1]).not.toHaveProperty('actor');
	const names = renderHook(() => useRegisterNames());
	expect(names.result.current).toEqual({ a: 'a' });
	expect(mockHttp.get).toHaveBeenCalledTimes(2);
});
it('requires a choice among three, then binds the tapped id', async () => {
	mockHttp.get.mockResolvedValue({ data: rows });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('choose'));
	await act(() => view.result.current.bind('b'));
	expect(view.result.current.status).toBe('bound');
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'b', name: 'b' });
	expect(logger.info).toHaveBeenCalledWith(
		'Register bound',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			terminal: { operationId: expect.stringMatching(/^[0-9a-f]{32}$/) },
			context: { type: 'register.bound', registerId: 'b', previousRegisterId: null },
		})
	);
	await act(() => view.result.current.bind('c'));
	expect(logger.info).toHaveBeenCalledWith(
		'Register switched',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			terminal: { operationId: expect.stringMatching(/^[0-9a-f]{32}$/) },
			context: { type: 'register.switched', registerId: 'c', previousRegisterId: 'b' },
		})
	);
	const ids = logger.info.mock.calls.map((call) => call[1]?.terminal?.operationId);
	expect(new Set(ids).size).toBe(ids.length);
});
it('keeps an existing valid pointer unchanged', async () => {
	await bindRegister(mockDB, mockSite, { id: 'b', name: 'Saved' }, mockStoreId);
	mockHttp.get.mockResolvedValue({ data: rows });
	const view = mount();
	await waitFor(() => expect(view.result.current.registers).toHaveLength(3));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({
		id: 'b',
		name: 'Saved',
	});
});
it('uses the pointer offline without fetching', async () => {
	await bindRegister(mockDB, mockSite, { id: 'b', name: 'Back' }, mockStoreId);
	mockStatus = 'offline';
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('bound'));
	expect(view.result.current.registerId).toBe('b');
	expect(mockHttp.get).not.toHaveBeenCalled();
});
it('leaves status unchanged on request failure', async () => {
	await bindRegister(mockDB, mockSite, { id: 'b', name: 'Back' }, mockStoreId);
	mockHttp.get.mockRejectedValue(new Error('offline'));
	const view = mount();
	await act(async () => {});
	expect(view.result.current.status).toBe('bound');
	expect(view.result.current.registerId).toBe('b');
	expect(logger.warn).toHaveBeenCalledWith('Register directory unavailable', {
		context: { type: 'register.directory-unavailable', registerId: 'b' },
	});
	expect(logger.warn.mock.calls[0][1]).not.toHaveProperty('actor');
});
it('clears a pointer from another store before asking for a choice', async () => {
	await bindRegister(mockDB, mockSite, { id: 'wrong-store', name: 'Other' }, mockStoreId);
	mockHttp.get.mockResolvedValue({ data: rows });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('choose'));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toBeNull();
	expect(logger.info).toHaveBeenCalledWith('Register unbound automatically', {
		context: { type: 'register.unbound', registerId: 'wrong-store' },
	});
	expect(logger.info.mock.calls[0][1]).not.toHaveProperty('actor');
});
it('shows none for an empty list', async () => {
	mockHttp.get.mockResolvedValue({ data: [] });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('none'));
});

it('rebinds the site pointer when the store changes', async () => {
	mockHttp.get
		.mockResolvedValueOnce({ data: [rows[0]] })
		.mockResolvedValueOnce({ data: rows[0] })
		.mockResolvedValueOnce({ data: [rows[1]] })
		.mockResolvedValueOnce({ data: rows[1] });
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	mockStoreId = 3;
	view.rerender();
	await waitFor(() => expect(view.result.current.registerId).toBe('b'));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'b', name: 'b' });
	expect(mockHttp.get).toHaveBeenCalledWith('registers', { params: { store_id: 3 } });
	expect(mockHttp.get).toHaveBeenLastCalledWith('registers/b');
});

it('clears the inherited store filter for the default store', async () => {
	mockStoreId = 0;
	mockHttp.get.mockResolvedValue({ data: [] });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('none'));
	expect(mockHttp.get).toHaveBeenCalledWith('registers', { params: { store_id: null } });
});

it('does not expose another store pointer offline, even before hydration', async () => {
	await bindRegister(mockDB, mockSite, { id: 'a', name: 'A' }, 1);
	mockStatus = 'offline';
	const reader = renderHook(() => useRegisterBinding());
	expect(reader.result.current.registerId).toBeNull();
	const session = mount();
	await act(async () => {});
	expect(session.result.current.registerId).toBeNull();
});

it('adopts the bound register detail counters before publishing the binding', async () => {
	mockHttp.get.mockImplementation(async (url) => ({
		data:
			url === 'registers'
				? [rows[0]]
				: {
						...rows[0],
						counters: {
							last_closure_number: 9,
							perpetual_sales_total: '100',
							perpetual_refunds_total: '10',
						},
					},
	}));
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	expect((await readRegister(mockDB))?.sites[mockSite].registers?.a).toMatchObject({
		last_closure_number: 9,
		perpetual_sales_total: '100.0000',
	});
});

it('names the local-floor fallback in one uncoded info row when the counter refresh fails', async () => {
	mockHttp.get.mockImplementation(async (url) => {
		if (url === 'registers') return { data: [rows[0]] };
		throw new Error('Network Error');
	});
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	await waitFor(() =>
		expect(logger.info).toHaveBeenCalledWith(
			"Register counters not refreshed from the store; using this device's counters",
			{ context: { registerId: 'a', step: 'store-read', error: 'Network Error' } }
		)
	);
	expect(logger.warn).not.toHaveBeenCalled();
	expect(logger.error).not.toHaveBeenCalled();
});

it('names a local adoption failure after a good store read, and still binds', async () => {
	mockHttp.get.mockImplementation(async (url) => ({
		data:
			url === 'registers'
				? [rows[0]]
				: {
						...rows[0],
						counters: {
							last_closure_number: 9,
							perpetual_sales_total: '100',
							perpetual_refunds_total: '10',
						},
					},
	}));
	mockAdoptCounters.mockRejectedValue(new Error('Register is not initialized'));
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	await waitFor(() =>
		expect(logger.info).toHaveBeenCalledWith(
			"Register counters from the store could not be saved on this device; using this device's counters",
			{
				context: {
					registerId: 'a',
					step: 'local-adoption',
					error: 'Register is not initialized',
				},
			}
		)
	);
	expect(logger.info).not.toHaveBeenCalledWith(
		"Register counters not refreshed from the store; using this device's counters",
		expect.anything()
	);
	expect(logger.warn).not.toHaveBeenCalled();
	expect(logger.error).not.toHaveBeenCalled();
});

it('does not log a manual re-bind to the current register', async () => {
	mockHttp.get.mockResolvedValue({ data: rows });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('choose'));
	await act(() => view.result.current.bind('b'));
	logger.info.mockClear();
	await act(() => view.result.current.bind('b'));
	expect(logger.info).not.toHaveBeenCalled();
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'b', name: 'b' });
});

it('does not log an unchanged sole-register binding on mount or reconnect', async () => {
	await bindRegister(mockDB, mockSite, rows[0], mockStoreId);
	mockHttp.get.mockImplementation(async (url) => ({
		data: url === 'registers' ? [rows[0]] : rows[0],
	}));
	const view = mount();
	await act(async () => {});
	expect(mockHttp.get).toHaveBeenCalledWith('registers/a');
	expect(logger.info).not.toHaveBeenCalled();
	mockStatus = 'offline';
	await act(async () => view.rerender());
	mockStatus = 'online-website-available';
	await act(async () => view.rerender());
	expect(logger.info).not.toHaveBeenCalled();
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'a', name: 'a' });
});

it('logs an automatic switch only when the previous binding differs', async () => {
	await bindRegister(mockDB, mockSite, rows[1], mockStoreId);
	mockHttp.get.mockImplementation(async (url) => ({
		data: url === 'registers' ? [rows[0]] : rows[0],
	}));
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	expect(logger.info.mock.calls).toEqual([
		[
			'Register switched automatically',
			{
				terminal: { operationId: 'a' },
				context: { type: 'register.switched', registerId: 'a', previousRegisterId: 'b' },
			},
		],
	]);
});

// Revert: inherit the physical till store filter, include other stores in the global directory, or rebind while browsing.
it('reads the default-store directory without rebinding the physical till', async () => {
	await bindRegister(mockDB, mockSite, { id: 'physical', name: 'Physical' }, 2);
	mockHttp.get.mockResolvedValue({
		data: [
			{ id: 'remote', name: 'Remote', store_id: null },
			{ id: 'physical', name: 'Physical', store_id: 2 },
		],
	});
	const { result } = renderHook(() => useRegisterDirectory(0));
	await waitFor(() => expect(result.current.registers).toHaveLength(1));
	expect(mockHttp.get).toHaveBeenCalledWith('registers', { params: { store_id: null } });
	expect(await readBoundRegister(mockDB, mockSite, 2)).toEqual({
		id: 'physical',
		name: 'Physical',
	});
});

it('reloads the directory on remount after a rejected request', async () => {
	mockHttp.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: rows });
	const first = renderHook(() => useRegisterDirectory(mockStoreId));
	await waitFor(() => expect(first.result.current.failed).toBe(true));
	first.unmount();
	const second = renderHook(() => useRegisterDirectory(mockStoreId));
	await waitFor(() => expect(second.result.current.registers).toEqual(rows));
	expect(second.result.current.failed).toBe(false);
	expect(mockHttp.get).toHaveBeenCalledTimes(2);
});

it('retries an empty directory and binds the newly available register', async () => {
	let answer: (value: { data: unknown }) => void = () => {};
	mockHttp.get
		.mockResolvedValueOnce({ data: [] })
		.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
		.mockResolvedValueOnce({ data: rows[0] });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('none'));
	expect(view.result.current.retrying).toBe(false);
	let retried: Promise<void> = Promise.resolve();
	act(() => {
		retried = view.result.current.retry();
	});
	// While the second request is in flight the gate stays: `retrying` carries the retried state.
	await waitFor(() => expect(view.result.current.retrying).toBe('none'));
	await act(async () => {
		answer({ data: [rows[0]] });
		await retried;
	});
	expect(view.result.current.retrying).toBe(false);
	expect(mockHttp.get.mock.calls.filter(([path]) => path === 'registers')).toEqual([
		['registers', { params: { store_id: 2 } }],
		['registers', { params: { store_id: 2 } }],
	]);
	expect(view.result.current.status).toBe('bound');
	expect(view.result.current.registerId).toBe('a');
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'a', name: 'a' });
});

it('retries a failed directory read and binds once for a double tap', async () => {
	let answer: (value: { data: unknown }) => void = () => {};
	// Both mount-time reads (the directory hook's and the session hook's) fail, so the state settles.
	mockHttp.get
		.mockRejectedValueOnce(new Error('offline'))
		.mockRejectedValueOnce(new Error('offline'))
		.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
		.mockResolvedValueOnce({ data: rows[0] });
	const view = mount();
	await waitFor(() => expect(mockHttp.get).toHaveBeenCalledTimes(2));
	await waitFor(() => expect(view.result.current.failed).toBe(true));
	expect(view.result.current.status).toBe('unknown');
	let first: Promise<void> = Promise.resolve();
	let second: Promise<void> = Promise.resolve();
	act(() => {
		first = view.result.current.retry();
		second = view.result.current.retry();
	});
	expect(second).toBe(first);
	await waitFor(() => expect(view.result.current.retrying).toBe('failed'));
	await act(async () => {
		answer({ data: [rows[0]] });
		await first;
	});
	expect(view.result.current.failed).toBe(false);
	expect(view.result.current.status).toBe('bound');
	expect(mockHttp.get.mock.calls.filter(([path]) => path === 'registers')).toHaveLength(3);
	expect(mockHttp.get.mock.calls.filter(([path]) => path === 'registers/a')).toHaveLength(1);
});

// Refresh only reads the list: even a sole-register answer must not bind or change the gate.
it('refreshes rows while keeping choose and shares an in-flight refresh', async () => {
	let answer: (value: { data: unknown }) => void = () => {};
	mockHttp.get
		.mockResolvedValueOnce({ data: rows })
		.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('choose'));
	let first: Promise<void> = Promise.resolve();
	act(() => {
		first = view.result.current.refresh();
		expect(view.result.current.refresh()).toBe(first);
	});
	expect(view.result.current.status).toBe('choose');
	expect(view.result.current.retrying).toBe(false);
	expect(view.result.current.registerId).toBeNull();
	expect(mockHttp.get.mock.calls).toEqual([
		['registers', { params: { store_id: 2 } }],
		['registers', { params: { store_id: 2 } }],
	]);
	const updated = [{ ...rows[0], name: 'Updated' }];
	await act(async () => {
		answer({ data: updated });
		await first;
	});
	expect(view.result.current.registers).toEqual(updated);
	expect(view.result.current.status).toBe('choose');
	expect(view.result.current.retrying).toBe(false);
	expect(view.result.current.registerId).toBeNull();
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toBeNull();
	expect(mockHttp.get).toHaveBeenCalledTimes(2);
});

it('ignores a superseded directory answer that lands after a refresh', async () => {
	let answerFirst: (value: { data: unknown }) => void = () => {};
	let answerSecond: (value: { data: unknown }) => void = () => {};
	mockHttp.get
		.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
		.mockImplementationOnce(() => new Promise((resolve) => (answerSecond = resolve)));
	const view = mount();
	await waitFor(() => expect(mockHttp.get).toHaveBeenCalledTimes(1));
	let refreshed: Promise<void> = Promise.resolve();
	act(() => {
		refreshed = view.result.current.refresh();
	});
	await waitFor(() => expect(mockHttp.get).toHaveBeenCalledTimes(2));
	await act(async () => {
		answerSecond({ data: [rows[1], rows[2]] });
		await refreshed;
	});
	await act(async () => {
		answerFirst({ data: [rows[0]] });
		await Promise.resolve();
	});
	// The older answer arrived last and changed nothing: the refreshed rows stand.
	expect(view.result.current.registers.map(({ id }) => id)).toEqual(['b', 'c']);
	expect(view.result.current.status).toBe('choose');
});
