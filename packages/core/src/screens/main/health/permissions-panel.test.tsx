/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { PermissionsPanel } from './permissions-panel';
import { permissionsRefreshGateFor } from '../../../services/permissions-refresh/gate';
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
const read = jest.mocked(readCashierPermissions);

const stamp = { kind: 'stamp', stamp: '0123456789abcdef' } as const;
// Gates are shared per cashier for the module's life, so each test has its own cashier.
let cashier = 0;

beforeEach(() => {
	jest.clearAllMocks();
	read.mockReset();
	status = 'online-website-available';
	session.wpCredentials = { uuid: `panel-cashier-${++cashier}` };
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

it('disables the action while an automatic read for this cashier runs', () => {
	expect(permissionsRefreshGateFor(session.wpCredentials.uuid).shouldRead(stamp)).toBe(true);
	render(<PermissionsPanel />);
	const button = screen.getByTestId('health-permissions-refresh') as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(read).not.toHaveBeenCalled();
});

it('holds automatic reads for this cashier while a manual read runs', async () => {
	let finish!: (result: PermissionsReadResult) => void;
	read.mockReturnValue(
		new Promise((resolve) => {
			finish = resolve;
		})
	);
	render(<PermissionsPanel />);
	fireEvent.click(screen.getByTestId('health-permissions-refresh'));
	expect(permissionsRefreshGateFor(session.wpCredentials.uuid).shouldRead(stamp)).toBe(false);
	await act(async () => {
		finish({ kind: 'unchanged' });
	});
});
