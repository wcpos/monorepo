/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRegisterNames } from './use-register-names';

const mockGet = jest.fn();
let mockRegister: { id: string; name: string } | null = null;
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('./use-register', () => ({ useRegister: () => mockRegister }));
jest.mock('./register-document', () => ({
	getRegisterSnapshot: () => ({ id: 'own', name: 'This till' }),
}));
it('provides the local name synchronously, shares one request and derives live renames', async () => {
	let resolve!: (value: unknown) => void;
	mockGet.mockReturnValue(
		new Promise((r) => {
			resolve = r;
		})
	);
	const first = renderHook(() => useRegisterNames());
	const second = renderHook(() => useRegisterNames());
	expect(first.result.current).toEqual({ own: 'This till' });
	await waitFor(() => expect(mockGet).toHaveBeenCalledWith('registers'));
	await act(async () => {
		resolve({
			data: [
				{ id: 'own', name: 'Stale' },
				{ id: 'other', name: 'Back desk' },
			],
		});
	});
	expect(first.result.current).toEqual({ own: 'This till', other: 'Back desk' });
	expect(second.result.current).toEqual(first.result.current);
	mockRegister = { id: 'own', name: 'Renamed' };
	first.rerender();
	expect(first.result.current.own).toBe('Renamed');
	first.unmount();
	second.unmount();
	renderHook(() => useRegisterNames());
	expect(mockGet).toHaveBeenCalledTimes(1);
});

let mockSession = { site: { uuid: 'initial-site' }, store: { id: 1 } };
jest.mock('../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));

it.each([
	['store', 'site-a', 2],
	['site', 'site-b', 1],
])(
	'keeps separate names when switching %s and reuses the same key',
	async (dimension, siteUuid, storeId) => {
		mockGet.mockReset();
		mockRegister = null;
		mockSession = { site: { uuid: `switch-${dimension}-site-a` }, store: { id: 1 } };
		mockGet.mockResolvedValueOnce({ data: [{ id: 'other', name: 'First store' }] });
		const first = renderHook(() => useRegisterNames());
		await waitFor(() => expect(first.result.current.other).toBe('First store'));
		const originalSession = mockSession;
		mockSession = {
			site: { uuid: `switch-${dimension}-${siteUuid}` },
			store: { id: Number(storeId) },
		};
		mockGet.mockResolvedValueOnce({ data: [{ id: 'other', name: 'Second store' }] });
		first.rerender();
		expect(first.result.current.other).toBeUndefined();
		await waitFor(() => expect(first.result.current.other).toBe('Second store'));
		const second = renderHook(() => useRegisterNames());
		expect(second.result.current.other).toBe('Second store');
		mockSession = originalSession;
		first.rerender();
		expect(first.result.current.other).toBe('First store');
		expect(mockGet).toHaveBeenCalledTimes(2);
	}
);
