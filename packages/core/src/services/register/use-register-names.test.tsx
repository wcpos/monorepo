/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { Observable } from 'rxjs';

import { useRegisterNames } from './use-register-names';

const mockGet = jest.fn();
let mockSession: Record<string, unknown> = {
	userDB: {},
	site: { uuid: 'site-a' },
	store: { id: 1 },
};
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	getRegisterSnapshot: () => null,
	getBoundRegisterId: (_siteUuid: string, _storeId?: number) => null,
	readBoundRegister: async (_userDB: unknown, _siteUuid: string, _storeId?: number) => null,
	bindRegister: async () => undefined,
	unbindRegister: async () => undefined,
}));
jest.mock('../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));

beforeEach(() => {
	mockGet.mockReset();
});

it("maps the store's registers by id and shares one request across readers", async () => {
	mockSession = { userDB: {}, site: { uuid: `site-${Math.random()}` }, store: { id: 1 } };
	mockGet.mockResolvedValue({
		data: [{ id: 'a', name: 'Front counter' }],
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
	mockGet.mockResolvedValueOnce({ data: [{ id: 'a', name: 'Store one' }] });
	const hook = renderHook(() => useRegisterNames());
	await waitFor(() => expect(hook.result.current.a).toBe('Store one'));
	mockSession = { userDB: {}, site: { uuid: site }, store: { id: 2 } };
	mockGet.mockResolvedValueOnce({ data: [{ id: 'b', name: 'Store two' }] });
	hook.rerender();
	await waitFor(() => expect(hook.result.current).toEqual({ b: 'Store two' }));
	expect(mockGet).toHaveBeenCalledTimes(2);
});

/** A store database whose closures query counts its subscribers. */
function closuresDB(rows: unknown[]) {
	const counts = { subscribed: 0, unsubscribed: 0 };
	const $ = new Observable<unknown[]>((subscriber) => {
		counts.subscribed += 1;
		subscriber.next(rows);
		return () => {
			counts.unsubscribed += 1;
		};
	});
	return { storeDB: { collections: { closures: { find: () => ({ $ }) } } }, counts };
}

it('names a retired register from its newest closure, and the directory wins for a live one', async () => {
	const { storeDB } = closuresDB([
		{ register_id: 'gone', number: 1, breakdowns: { register_name: 'Back till' } },
		{ register_id: 'live', number: 2, breakdowns: { register_name: 'Old front name' } },
	]);
	mockSession = { userDB: {}, storeDB, site: { uuid: `site-${Math.random()}` }, store: { id: 1 } };
	mockGet.mockResolvedValue({ data: [{ id: 'live', name: 'Front counter' }] });
	const hook = renderHook(() => useRegisterNames());
	expect(hook.result.current).toEqual({ gone: 'Back till', live: 'Old front name' });
	await waitFor(() =>
		expect(hook.result.current).toEqual({ gone: 'Back till', live: 'Front counter' })
	);
});

it('shares one closures subscription per store database across readers', async () => {
	const { storeDB, counts } = closuresDB([
		{ register_id: 'gone', number: 1, breakdowns: { register_name: 'Back till' } },
	]);
	mockSession = { userDB: {}, storeDB, site: { uuid: `site-${Math.random()}` }, store: { id: 1 } };
	mockGet.mockResolvedValue({ data: [] });
	const first = renderHook(() => useRegisterNames());
	const second = renderHook(() => useRegisterNames());
	await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
	expect(first.result.current).toEqual({ gone: 'Back till' });
	expect(second.result.current).toEqual({ gone: 'Back till' });
	expect(counts).toEqual({ subscribed: 1, unsubscribed: 0 });
	first.unmount();
	expect(counts).toEqual({ subscribed: 1, unsubscribed: 0 });
	second.unmount();
	expect(counts).toEqual({ subscribed: 1, unsubscribed: 1 });
});
