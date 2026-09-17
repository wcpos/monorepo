/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../../jest/translate';
import { RecountSheet } from './recount-sheet';
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { capabilities: manager ? ['manage_woocommerce_pos_closures'] : [] },
		store: { currency: 'USD' },
	}),
	useStoreSession: () => ({
		wpCredentials: { id: 7, capabilities: manager ? ['manage_woocommerce_pos_closures'] : [] },
		store: { currency: 'USD' },
	}),
}));
jest.mock('../../pos/contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
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

jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (v: T) => unknown) => (source ? select(source) : undefined),
}));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'sm' }) }));
jest.mock('../../../../services/register/register-document', () => ({
	mintUuid: () => mockMint(),
}));
jest.mock('../../../../services/register-session/use-session-report', () => ({
	useSessionReport: () => ({}),
}));
const mockMint = jest.fn(() => 'client-uuid');
let manager = true;
const row = {
	id: 'closure',
	server_closure_id: 'server-closure',
	counted: { cash: '99', card: '3' },
	sync_status: 'synced',
};
const done = jest.fn();
const close = jest.fn();
const mount = () => render(<RecountSheet row={row as never} onSaved={done} onOpenChange={close} />);
const fillCount = () => {
	fireEvent.change(screen.getByTestId('recount-cash'), { target: { value: '101.25' } });
	fireEvent.change(screen.getByTestId('recount-card'), { target: { value: '4' } });
	fireEvent.change(screen.getByTestId('recount-reason'), { target: { value: 'Found notes' } });
};
beforeEach(() => {
	jest.clearAllMocks();
	manager = true;
	online = 'online-website-available';
	post.mockResolvedValue({ data: {} });
});
// Revert: close the session instead of appending a recount, omit reason, or use the losing local uuid.
it('submits the entered tenders and reason to the closure, then reloads', async () => {
	mount();
	fillCount();
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
	expect(post).toHaveBeenCalledWith('closures/server-closure/recount', {
		id: 'client-uuid',
		counted: { cash: '101.25', card: '4' },
		reason: 'Found notes',
	});
	expect(closeSession).not.toHaveBeenCalled();
	expect(patch).not.toHaveBeenCalled();
	expect(close).toHaveBeenCalledWith(false);
});
// Revert: skip manager credentials or call ApproveSheet's close-session side effects.
it('requires and submits manager credentials without the closure capability', async () => {
	manager = false;
	mount();
	fillCount();
	expect((screen.getByTestId('recount-save') as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByTestId('approve-username'), { target: { value: 'manager' } });
	fireEvent.change(screen.getByTestId('approve-password'), { target: { value: 'secret' } });
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() => expect(done).toHaveBeenCalled());
	expect(post).toHaveBeenCalledWith(
		'closures/server-closure/recount',
		expect.objectContaining({ approval: { username: 'manager', password: 'secret' } })
	);
	expect(closeSession).not.toHaveBeenCalled();
});
// Revert: permit offline writes or hide the reason for the disabled button.
it('disables offline recount with an explanation and no requests', () => {
	online = 'offline';
	mount();
	fillCount();
	expect(screen.getByTestId('recount-offline').textContent).toBe('Connect to recount');
	fireEvent.click(screen.getByTestId('recount-save'));
	expect(post).not.toHaveBeenCalled();
});
// Revert: allow duplicate correction writes before saving state renders, or retry a refusal.
it('coalesces repeated submit taps and surfaces a refusal without retrying', async () => {
	post.mockRejectedValue(new Error('refused'));
	mount();
	fillCount();
	act(() => {
		fireEvent.click(screen.getByTestId('recount-save'));
		fireEvent.click(screen.getByTestId('recount-save'));
	});
	await waitFor(() => expect(screen.getByTestId('recount-error')).toBeTruthy());
	expect(post).toHaveBeenCalledTimes(1);
	expect(done).not.toHaveBeenCalled();
});

jest.mock('../../pos/cart/register-count', () => ({
	DenominationTile: ({ value, add }: { value: string; add: (n: number) => void }) => (
		<button data-testid={`den-tile-${value}`} onClick={() => add(1)} />
	),
}));
// Revert: use a captured count during a held denomination key and lose repeated increments.
it('accumulates denomination presses and sends their cash total', async () => {
	mount();
	fillCount();
	fireEvent.click(screen.getByTestId('recount-denominations'));
	act(() => {
		fireEvent.click(screen.getByTestId('den-tile-10'));
		fireEvent.click(screen.getByTestId('den-tile-10'));
	});
	expect((screen.getByTestId('recount-cash') as HTMLInputElement).value).toBe('20.00');
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() =>
		expect(post).toHaveBeenCalledWith(
			'closures/server-closure/recount',
			expect.objectContaining({ counted: { cash: '20.00', card: '4' } })
		)
	);
});

// Revert: mint an id for each retry, duplicating an accepted correction after response loss.
it('reuses the recount id until inputs change', async () => {
	mockMint.mockReturnValueOnce('first').mockReturnValueOnce('changed');
	post.mockRejectedValue(new Error('response lost'));
	mount();
	fillCount();
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() => expect(screen.getByTestId('recount-error')).toBeTruthy());
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
	expect(post.mock.calls.map(([, body]) => body.id)).toEqual(['first', 'first']);
	fireEvent.change(screen.getByTestId('recount-reason'), { target: { value: 'Changed reason' } });
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
	expect(post.mock.calls[2][1].id).toBe('changed');
});
