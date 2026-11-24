/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { PermissionsPanel } from './permissions-panel';
import { resetPermissionsRefreshGate } from '../../../services/permissions-refresh/bridge';
import {
	type PermissionsReadResult,
	readCashierPermissions,
} from '../../../services/permissions-refresh/read-cashier-permissions';

type Props = {
	children?: React.ReactNode;
	testID?: string;
	disabled?: boolean;
	onPress?: () => void;
};
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, disabled, onPress }: Props) => (
		<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: Props) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: Props) => <span data-testid={testID}>{children}</span>,
}));
jest.mock('@wcpos/components/section', () => ({
	Section: ({
		children,
		title,
		sub,
		action,
	}: Props & { title: string; sub: string; action: React.ReactNode }) => (
		<section>
			<h2>{title}</h2>
			<p>{sub}</p>
			{action}
			{children}
		</section>
	),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
const session = { site: {}, wpCredentials: { uuid: 'cashier-1' }, userDB: {}, user: {} };
const http = {};
let status = 'online-website-available';
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => session,
	useAppState: () => session,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({ useHttpClient: () => http }));
jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: () => ({ status }) }));
jest.mock('../../../services/permissions-refresh/read-cashier-permissions', () => ({
	readCashierPermissions: jest.fn(),
}));
jest.mock('../../../services/permissions-refresh/bridge', () => ({
	resetPermissionsRefreshGate: jest.fn(),
}));
const read = jest.mocked(readCashierPermissions);

beforeEach(() => {
	jest.clearAllMocks();
	read.mockReset();
	status = 'online-website-available';
});

it.each<[PermissionsReadResult, string]>([
	[{ kind: 'updated', granted: 2, removed: 1 }, 'Permissions updated: 2 granted, 1 removed.'],
	[{ kind: 'unchanged' }, 'Permissions are up to date.'],
	[
		{ kind: 'refused', status: 403 },
		'The store refused this cashier. Gated actions stay off until it allows them again.',
	],
	[{ kind: 'expired' }, 'The session has expired. Sign in again to read permissions.'],
	[{ kind: 'offline' }, 'Offline. The last known permissions are kept.'],
	[{ kind: 'failed' }, 'Could not read permissions. The last known permissions are kept.'],
])('shows the %j result after pressing Refresh permissions', async (result, message) => {
	read.mockResolvedValue(result);
	render(<PermissionsPanel />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('health-permissions-refresh'));
	});
	expect(screen.getByTestId('health-permissions-result').textContent).toBe(message);
	expect(read).toHaveBeenCalledWith({ ...session, http });
	expect(resetPermissionsRefreshGate).toHaveBeenCalledWith('cashier-1');
});

it('disables the action offline', () => {
	status = 'offline';
	render(<PermissionsPanel />);
	const button = screen.getByTestId('health-permissions-refresh') as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(read).not.toHaveBeenCalled();
});

it('disables the action until the read completes', async () => {
	let finish!: (result: PermissionsReadResult) => void;
	read.mockReturnValue(
		new Promise((resolve) => {
			finish = resolve;
		})
	);
	render(<PermissionsPanel />);
	const button = screen.getByTestId('health-permissions-refresh') as HTMLButtonElement;
	fireEvent.click(button);
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(read).toHaveBeenCalledTimes(1);
	await act(async () => {
		finish({ kind: 'unchanged' });
	});
	expect(button.disabled).toBe(false);
});
