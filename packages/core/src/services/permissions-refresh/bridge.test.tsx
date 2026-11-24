/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { PermissionsRefreshBridge } from './bridge';
import { type PermissionsReadResult, readCashierPermissions } from './read-cashier-permissions';
import { type PermissionsSignal, reportPermissionsSignal } from './signal';

const session = { site: {}, wpCredentials: { uuid: 'cashier-1' }, userDB: {}, user: {} };
const http = {};
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => session,
	useAppState: () => session,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({ useHttpClient: () => http }));
jest.mock('./read-cashier-permissions', () => ({ readCashierPermissions: jest.fn() }));
const read = jest.mocked(readCashierPermissions);
const first = { kind: 'stamp', stamp: '0123456789abcdef' } as const;
const second = { kind: 'stamp', stamp: 'fedcba9876543210' } as const;
const emit = async (signal: PermissionsSignal) => {
	await act(async () => {
		reportPermissionsSignal(signal);
	});
};

beforeEach(() => {
	read.mockReset().mockResolvedValue({ kind: 'unchanged' });
	session.wpCredentials = { uuid: 'cashier-1' };
	jest.spyOn(Date, 'now').mockReturnValue(0);
});
afterEach(() => {
	jest.restoreAllMocks();
});

it('reads on two different stamps', async () => {
	render(<PermissionsRefreshBridge />);
	await emit(first);
	await emit(second);
	expect(read).toHaveBeenCalledTimes(2);
	expect(read).toHaveBeenCalledWith({ ...session, http });
});

it('reads the same stamp only once, even after a failure', async () => {
	read.mockResolvedValue({ kind: 'offline' });
	render(<PermissionsRefreshBridge />);
	await emit(first);
	await emit(first);
	expect(read).toHaveBeenCalledTimes(1);
});

it('does not read on a refusal within 60 seconds of the last read', async () => {
	render(<PermissionsRefreshBridge />);
	await emit(first);
	jest.mocked(Date.now).mockReturnValue(59_999);
	await emit({ kind: 'refused' });
	expect(read).toHaveBeenCalledTimes(1);
	jest.mocked(Date.now).mockReturnValue(60_000);
	await emit({ kind: 'refused' });
	expect(read).toHaveBeenCalledTimes(2);
});

it('unsubscribes on unmount', async () => {
	const { unmount } = render(<PermissionsRefreshBridge />);
	await emit(first);
	unmount();
	await emit(second);
	expect(read).toHaveBeenCalledTimes(1);
});

it('keeps an in-flight read single and allows the next signal after it settles', async () => {
	let finish!: (result: PermissionsReadResult) => void;
	read.mockReturnValueOnce(
		new Promise((resolve) => {
			finish = resolve;
		})
	);
	render(<PermissionsRefreshBridge />);
	await emit(first);
	await emit(second);
	expect(read).toHaveBeenCalledTimes(1);
	await act(async () => {
		finish({ kind: 'unchanged' });
	});
	await emit(second);
	expect(read).toHaveBeenCalledTimes(2);
});

it('starts a fresh gate when the cashier uuid changes', async () => {
	const { rerender } = render(<PermissionsRefreshBridge />);
	await emit(first);
	session.wpCredentials = { uuid: 'cashier-2' };
	rerender(<PermissionsRefreshBridge />);
	await emit(first);
	expect(read).toHaveBeenCalledTimes(2);
	expect(read).toHaveBeenLastCalledWith({ ...session, http });
});
