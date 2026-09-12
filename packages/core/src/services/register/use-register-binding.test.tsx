/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { UserDatabase } from '@wcpos/database';

import { bindRegister, ensureRegister, readBoundRegister } from './register-document';
import { useRegisterBinding, useRegisterBindingSession } from './use-register-binding';
import { useRegisterNames } from './use-register-names';

let mockStatus = 'online-website-available';
let mockDB: UserDatabase;
let mockSite = '';
let mockStoreId = 2;
const mockHttp = { get: jest.fn() };
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => ({ userDB: mockDB, site: { uuid: mockSite }, store: { id: mockStoreId } }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));
addRxPlugin(RxDBLocalDocumentsPlugin);
beforeEach(async () => {
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
	const names = renderHook(() => useRegisterNames());
	expect(names.result.current).toEqual({ a: 'a' });
	expect(mockHttp.get).toHaveBeenCalledTimes(1);
});
it('requires a choice among three, then binds the tapped id', async () => {
	mockHttp.get.mockResolvedValue({ data: rows });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('choose'));
	await act(() => view.result.current.bind('b'));
	expect(view.result.current.status).toBe('bound');
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'b', name: 'b' });
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
});
it('clears a pointer from another store before asking for a choice', async () => {
	await bindRegister(mockDB, mockSite, { id: 'wrong-store', name: 'Other' }, mockStoreId);
	mockHttp.get.mockResolvedValue({ data: rows });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('choose'));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toBeNull();
});
it('shows none for an empty list', async () => {
	mockHttp.get.mockResolvedValue({ data: [] });
	const view = mount();
	await waitFor(() => expect(view.result.current.status).toBe('none'));
});

it('rebinds the site pointer when the store changes', async () => {
	mockHttp.get
		.mockResolvedValueOnce({ data: [rows[0]] })
		.mockResolvedValueOnce({ data: [rows[1]] });
	const view = mount();
	await waitFor(() => expect(view.result.current.registerId).toBe('a'));
	mockStoreId = 3;
	view.rerender();
	await waitFor(() => expect(view.result.current.registerId).toBe('b'));
	expect(await readBoundRegister(mockDB, mockSite, mockStoreId)).toEqual({ id: 'b', name: 'b' });
	expect(mockHttp.get).toHaveBeenLastCalledWith('registers', { params: { store_id: 3 } });
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
