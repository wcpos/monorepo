/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as audit from '../../../../services/register-session/audit';
import { createTestT } from '../../../../../jest/translate';
import { ApproveSheet } from './approve-sheet';
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' } }),
}));
const recordFact = jest.spyOn(audit, 'recordRegisterFact');
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
		loading,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button data-testid={testID} disabled={disabled || loading} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
		secureTextEntry,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
		secureTextEntry?: boolean;
	}) => (
		<input
			type={secureTextEntry ? 'password' : 'text'}
			data-testid={testID}
			value={value}
			onChange={(e) => onChangeText(e.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ testID }: { testID?: string }) => <span data-testid={testID} />,
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <>{children}</> : null,
	DialogContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
const post = jest.fn(),
	patch = jest.fn(async () => undefined),
	closeSession = jest.fn(async () => undefined);
let online = 'online-website-available';
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({ post }) }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: online }),
}));
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		session: { id: 's', register_id: 'r', incrementalPatch: patch },
		actions: { closeSession },
	}),
}));
const props = { counted: { cash: '463.30' }, onClosed: jest.fn(), onOpenChange: jest.fn() };
function fill() {
	fireEvent.change(screen.getByTestId('approve-username'), { target: { value: 'manager' } });
	fireEvent.change(screen.getByTestId('approve-password'), { target: { value: 'secret' } });
	fireEvent.click(screen.getByTestId('approve-confirm'));
}
beforeEach(() => {
	jest.clearAllMocks();
	online = 'online-website-available';
});
it('refused credentials/capability show an error without closing', async () => {
	post.mockRejectedValue({ response: { status: 403, data: { code: 'wcpos_override_refused' } } });
	render(<ApproveSheet {...props} />);
	fill();
	await waitFor(() =>
		expect(screen.getByTestId('approve-error').textContent).toBe(
			'This account cannot approve closes'
		)
	);
	expect(recordFact).toHaveBeenCalledWith({
		actor: { id: '7', name: 'Pat' },
		...{ kind: 'approval-refused', sessionId: 's', registerId: 'r' },
	});
	expect(JSON.stringify(recordFact.mock.calls)).not.toMatch(/secret|manager/);
	expect(patch).not.toHaveBeenCalled();
	expect(closeSession).not.toHaveBeenCalled();
});
it('approves on the server, persists only approved_by, then closes without a token', async () => {
	post.mockResolvedValue({ data: { approved_by: 42 } });
	render(<ApproveSheet {...props} />);
	fill();
	await waitFor(() => expect(props.onClosed).toHaveBeenCalled());
	expect(post).toHaveBeenCalledWith('sessions/s/approve', {
		username: 'manager',
		password: 'secret',
	});
	expect(patch).toHaveBeenCalledWith({
		approved_by: 42,
		approval_required: false,
		sync_error: null,
	});
	expect(closeSession).toHaveBeenCalledWith({ counted: props.counted });
	expect(recordFact).toHaveBeenCalledWith({
		actor: { id: '7', name: 'Pat' },
		...{
			kind: 'approval-granted',
			sessionId: 's',
			registerId: 'r',
			approvedBy: 42,
		},
	});
	expect(JSON.stringify(recordFact.mock.calls)).not.toMatch(/secret|manager/);
	expect(patch.mock.invocationCallOrder[0]).toBeLessThan(closeSession.mock.invocationCallOrder[0]);
});
it.each(['offline', 'online-website-unavailable'])('blocks approval while %s', (status) => {
	online = status;
	render(<ApproveSheet {...props} />);
	fill();
	expect(screen.getByTestId('approve-offline').textContent).toBe('Approval needs a connection');
	expect(post).not.toHaveBeenCalled();
	expect(closeSession).not.toHaveBeenCalled();
});
it('409 stays in the sheet and never leaks the request error', async () => {
	post.mockRejectedValue({ response: { status: 409 }, message: 'secret' });
	render(<ApproveSheet {...props} />);
	fill();
	await waitFor(() => expect(screen.getByTestId('approve-error')).toBeTruthy());
	expect(screen.getByTestId('approve-error').textContent).not.toContain('secret');
	expect(closeSession).not.toHaveBeenCalled();
});

it('does not label a failed close as a refused approval', async () => {
	post.mockResolvedValue({ data: { approved_by: 42 } });
	closeSession.mockRejectedValueOnce(new Error('disk'));
	render(<ApproveSheet {...props} />);
	fill();
	await waitFor(() => expect(screen.getByTestId('approve-error')).toBeTruthy());
	expect(recordFact).not.toHaveBeenCalledWith(
		expect.objectContaining({ kind: 'approval-refused' })
	);
	expect(recordFact).toHaveBeenCalledTimes(1);
});
