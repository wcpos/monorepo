/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useRegisterWithServer } from './use-register-with-server';

let mockStatus = 'offline';
const mockRegister = jest.fn();
const mockSession = {
	userDB: {},
	site: { uuid: 'site' },
	store: { uuid: 'store' },
	wpCredentials: { uuid: 'cashier' },
};
jest.mock('../../contexts/app-state', () => ({ useStoreSession: () => mockSession }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: jest.fn() }),
}));
jest.mock('./register-with-server', () => ({
	registerWithServer: (input: unknown) => mockRegister(input),
}));
it('defers an offline cold start until online, attempts once, and remounts for a new session', () => {
	const view = renderHook(() => useRegisterWithServer());
	expect(mockRegister).not.toHaveBeenCalled();
	mockStatus = 'online-website-available';
	view.rerender();
	expect(mockRegister).toHaveBeenCalledTimes(1);
	expect(mockRegister).toHaveBeenLastCalledWith(expect.objectContaining({ siteUuid: 'site' }));
	mockStatus = 'offline';
	view.rerender();
	mockStatus = 'online-website-available';
	view.rerender();
	expect(mockRegister).toHaveBeenCalledTimes(1);
	view.unmount();
	mockSession.site.uuid = 'other';
	const next = renderHook(() => useRegisterWithServer());
	expect(mockRegister).toHaveBeenCalledTimes(2);
	expect(mockRegister).toHaveBeenLastCalledWith(expect.objectContaining({ siteUuid: 'other' }));
	next.unmount();
});
