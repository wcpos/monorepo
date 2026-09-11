/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { useRegisterNames } from './use-register-names';

const mockGet = jest.fn(async () => {
	throw new Error('offline');
});
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('./use-register', () => ({ useRegister: () => null }));
jest.mock('./register-document', () => ({ getRegisterSnapshot: () => null }));
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: { uuid: 'site-a' }, store: { id: 1 } }),
}));

it('settles failures to an empty directory and does not retry on remount', async () => {
	const first = renderHook(() => useRegisterNames());
	await act(async () => {
		await Promise.resolve();
	});
	expect(first.result.current).toEqual({});
	first.unmount();
	const second = renderHook(() => useRegisterNames());
	await act(async () => {
		await Promise.resolve();
	});
	expect(second.result.current).toEqual({});
	expect(mockGet).toHaveBeenCalledTimes(1);
});
