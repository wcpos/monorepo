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

let mockName = 'Till';
jest.mock('./use-register', () => ({ useRegister: () => ({ name: mockName }) }));

it('re-arms a failed registration after an offline rename and online transition', async () => {
	const { act } = await import('@testing-library/react');
	const post = jest
		.fn()
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValue({ status: 201 });
	const client = jest
		.spyOn(jest.requireMock('../../screens/main/hooks/use-rest-http-client'), 'useRestHttpClient')
		.mockReturnValue({ post });
	const data = { id: 'register', name: 'Till', platform: 'web', sites: {} };
	const doc = { toJSON: () => ({ data }), incrementalModify: jest.fn() };
	mockSession.userDB = { getLocal: async () => doc };
	mockRegister
		.mockClear()
		.mockImplementation(jest.requireActual('./register-with-server').registerWithServer);
	mockStatus = 'online-website-available';
	const view = renderHook(() => useRegisterWithServer());
	await act(() => mockRegister.mock.results[0].value);
	expect(post).toHaveBeenCalledTimes(1);
	expect(doc.incrementalModify).not.toHaveBeenCalled();
	mockStatus = 'offline';
	mockName = data.name = 'Front';
	view.rerender();
	expect(post).toHaveBeenCalledTimes(1);
	mockStatus = 'online-website-available';
	view.rerender();
	await act(() => mockRegister.mock.results[1].value);
	expect(post).toHaveBeenCalledTimes(2);
	expect(post).toHaveBeenLastCalledWith('registers', expect.objectContaining({ name: 'Front' }));
	expect(doc.incrementalModify).toHaveBeenCalledTimes(1);
	view.unmount();
	client.mockRestore();
});

it('waits for the initial register emission and sends one POST while it is pending', async () => {
	const { act } = await import('@testing-library/react');
	const data = { id: 'register', name: 'Till', platform: 'web', sites: {} };
	const doc = { toJSON: () => ({ data }), incrementalModify: jest.fn() };
	mockSession.userDB = { getLocal: async () => doc };
	mockStatus = 'online-website-available';
	mockRegister
		.mockClear()
		.mockImplementation(jest.requireActual('./register-with-server').registerWithServer);
	let finish!: (response: { status: number }) => void;
	const post = jest.fn(
		() =>
			new Promise<{ status: number }>((resolve) => {
				finish = resolve;
			})
	);
	const client = jest
		.spyOn(jest.requireMock('../../screens/main/hooks/use-rest-http-client'), 'useRestHttpClient')
		.mockReturnValue({ post });
	const register = jest
		.spyOn(jest.requireMock('./use-register'), 'useRegister')
		.mockReturnValue(null);
	const view = renderHook(() => useRegisterWithServer());
	try {
		await act(async () => {});
		expect(post).not.toHaveBeenCalled();
		register.mockReturnValue(data);
		await act(async () => view.rerender());
		expect(post).toHaveBeenCalledTimes(1);
		register.mockReturnValue({ ...data });
		await act(async () => view.rerender());
		expect(post).toHaveBeenCalledTimes(1);
	} finally {
		await act(async () => {
			finish({ status: 201 });
			await Promise.resolve();
		});
		view.unmount();
		register.mockRestore();
		client.mockRestore();
	}
});
