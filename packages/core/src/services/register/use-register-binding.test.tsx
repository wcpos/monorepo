/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { getLogger } from '@wcpos/utils/logger';
import type { UserDatabase } from '@wcpos/database';

import { bindRegister, ensureRegister, readBoundRegister, readRegister } from './register-document';
import { useRegisterBinding, useRegisterBindingSession } from './use-register-binding';
import { useRegisterNames } from './use-register-names';

let mockStatus = 'online-website-available';
let mockDB: UserDatabase;
let mockSite = '';
let mockStoreId = 2;
const logger = jest.mocked(getLogger(['wcpos', 'register']));
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
});
afterEach(async () => {
	await mockDB.remove();
});
const rows = ['a', 'b', 'c'].map((id) => ({ id, name: id, status: 'active' }));
function mount() {
	return renderHook(() => {
		useRegisterBindingSession();
		return useRegisterBinding();
	});
}
it('silently binds the sole active register and filters by store', async () => {
	mockHttp.get.mockResolvedValue({
		data: [rows[0], { id: 'retired', name: 'Old', status: 'inactive' }],
	});
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'a', name: 'a' });
	expect(mockHttp.get).toHaveBeenCalledWith('registers', { params: { store_id: 2 } });
	expect(view.result.current.registers).toHaveLength(1);
	expect(logger.info).toHaveBeenCalledWith('Register bound automatically', {
		terminal: { operationId: 'a' },
		context: { type: 'register.bound', registerId: 'a' },
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
			terminal: { operationId: 'b' },
			context: { type: 'register.bound', registerId: 'b', previousRegisterId: null },
		})
	);
	await act(() => view.result.current.bind('c'));
	expect(logger.info).toHaveBeenCalledWith(
		'Register switched',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			terminal: { operationId: 'c' },
			context: { type: 'register.switched', registerId: 'c', previousRegisterId: 'b' },
		})
	);
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

it('requests without a store filter for the default store', async () => {
	mockStoreId = 0;
	mockHttp.get.mockResolvedValue({ data: [] });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('none'));
	expect(mockHttp.get).toHaveBeenCalledWith('registers', undefined);
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
			{ terminal: { operationId: 'a' }, context: { type: 'register.switched', registerId: 'a' } },
		],
	]);
});
