/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

import { useRegisterNames } from './use-register-names';

const mockGet = jest.fn();
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
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => ({ userDB: {}, site: { uuid: 'failure-site' }, store: { id: 1 } }),
}));

it('a failed directory request leaves the names empty and lets the next reader retry', async () => {
	mockGet.mockRejectedValueOnce(new Error('offline'));
	const hook = renderHook(() => useRegisterNames());
	await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
	expect(hook.result.current).toEqual({});
	mockGet.mockResolvedValueOnce({ data: [{ id: 'a', name: 'Back', status: 'active' }] });
	const again = renderHook(() => useRegisterNames());
	await waitFor(() => expect(again.result.current).toEqual({ a: 'Back' }));
});
