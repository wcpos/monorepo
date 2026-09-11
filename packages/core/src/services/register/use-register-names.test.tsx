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
