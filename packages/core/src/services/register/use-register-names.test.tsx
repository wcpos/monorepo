/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

import { useRegisterNames } from './use-register-names';

const mockGet = jest.fn();
let mockSession = { userDB: {}, site: { uuid: 'site-a' }, store: { id: 1 } };
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('./register-document', () => ({
	getRegisterSnapshot: () => null,
	readBoundRegister: async () => null,
	bindRegister: async () => undefined,
	unbindRegister: async () => undefined,
}));
jest.mock('../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));

beforeEach(() => {
	mockGet.mockReset();
});

it("maps the store's active registers by id and shares one request across readers", async () => {
	mockSession = { userDB: {}, site: { uuid: `site-${Math.random()}` }, store: { id: 1 } };
	mockGet.mockResolvedValue({
		data: [
			{ id: 'a', name: 'Front counter', status: 'active' },
			{ id: 'old', name: 'Retired', status: 'retired' },
		],
	});
	const first = renderHook(() => useRegisterNames());
	await waitFor(() => expect(first.result.current).toEqual({ a: 'Front counter' }));
	const second = renderHook(() => useRegisterNames());
	expect(second.result.current).toEqual({ a: 'Front counter' });
	expect(mockGet).toHaveBeenCalledTimes(1);
	expect(mockGet).toHaveBeenCalledWith('registers', { params: { store_id: 1 } });
});

it('keeps a separate directory per site and store', async () => {
	const site = `site-${Math.random()}`;
	mockSession = { userDB: {}, site: { uuid: site }, store: { id: 1 } };
	mockGet.mockResolvedValueOnce({ data: [{ id: 'a', name: 'Store one', status: 'active' }] });
	const hook = renderHook(() => useRegisterNames());
	await waitFor(() => expect(hook.result.current.a).toBe('Store one'));
	mockSession = { userDB: {}, site: { uuid: site }, store: { id: 2 } };
	mockGet.mockResolvedValueOnce({ data: [{ id: 'b', name: 'Store two', status: 'active' }] });
	hook.rerender();
	await waitFor(() => expect(hook.result.current).toEqual({ b: 'Store two' }));
	expect(mockGet).toHaveBeenCalledTimes(2);
});
