/** @jest-environment jsdom */
import * as React from 'react';

import { of } from 'rxjs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../../jest/translate';
import { RegisterAmount } from '../../pos/cart/movement-sheet';
import { RecountSheet } from './recount-sheet';

import type { Correction } from '../../../../services/register-session/settled-figures';
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
const viewedStores = of([
	{
		id: 0,
		currency: 'USD',
		currency_pos: 'left',
		price_num_decimals: 2,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
	{
		id: 2,
		currency: 'EUR',
		currency_pos: 'right_space',
		price_num_decimals: 2,
		price_decimal_sep: ',',
		price_thousand_sep: '.',
	},
]);
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: {
			capabilities: manager ? ['manage_woocommerce_pos_closures'] : [],
			populate$: () => viewedStores,
		},
		store: {
			id: 1,
			currency: currentCurrency,
			currency_pos: 'left',
			price_num_decimals: 2,
			price_decimal_sep: '.',
			price_thousand_sep: ',',
		},
	}),
	useStoreSession: () => ({
		wpCredentials: { id: 7, capabilities: manager ? ['manage_woocommerce_pos_closures'] : [] },
		store: {
			id: 1,
			currency: currentCurrency,
			currency_pos: 'left',
			price_num_decimals: 2,
			price_decimal_sep: '.',
			price_thousand_sep: ',',
		},
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
		maxLength,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
		secureTextEntry?: boolean;
		maxLength?: number;
	}) => (
		<input
			type={secureTextEntry ? 'password' : 'text'}
			maxLength={maxLength}
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
const dialogContent = jest.fn();
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <>{children}</> : null,
	DialogContent: (
		props: React.PropsWithChildren<{ testID?: string; closeButtonProps?: { testID?: string } }>
	) => {
		dialogContent(props);
		return <div data-testid={props.testID}>{props.children}</div>;
	},
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
let currentCurrency = 'USD';
const row = {
	id: 'closure',
	store_id: 1,
	server_closure_id: 'server-closure',
	counted: { cash: '99', card: '3' },
	expected: { cash: '100', card: '3' },
	variance: { cash: '-1', card: '0' },
	period_sales_total: '3',
	period_refunds_total: '0',
	perpetual_sales_total: '3',
	perpetual_refunds_total: '0',
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
	currentCurrency = 'USD';
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

// Revert: read denominations from the till or fail to pass the viewed formatter to counting controls.
it('counts and formats euro denominations for a euro closure on a dollar till', async () => {
	render(
		<RecountSheet row={{ ...row, store_id: 2 } as never} onSaved={done} onOpenChange={close} />
	);
	fillCount();
	fireEvent.click(screen.getByTestId('recount-denominations'));
	expect(screen.queryByTestId('den-tile-0.25')).toBeNull();
	const coin = screen.getByTestId('den-tile-0.20');
	expect(coin.textContent).toContain('0,20 €');
	expect(screen.getByTestId('recount-cash').parentElement?.textContent).toContain('€');
	fireEvent.click(coin);
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() =>
		expect(post).toHaveBeenCalledWith(
			'closures/server-closure/recount',
			expect.objectContaining({ counted: { cash: '0.20', card: '4' } })
		)
	);
});

// Revert: seed only cash and counted keys, excluding omitted and correction-only tenders.
it('submits expected, counted, and correction-only tenders in a recount', async () => {
	const corrections: Correction[] = [
		{
			id: 1,
			type: 'late_sale',
			created_at: '2026-09-17T12:00:00Z',
			actor: { id: 7, name: 'Cashier' },
			approver: null,
			reason: '',
			figures: { expected_delta: { voucher: '5' } },
		},
		{
			id: 2,
			type: 'recount',
			created_at: '2026-09-17T13:00:00Z',
			actor: { id: 7, name: 'Cashier' },
			approver: null,
			reason: 'Found tender',
			figures: { counted: { custom: '6' } },
		},
	];
	// Spread allows the new corrections input to reach the real component in the red run.
	render(
		<RecountSheet
			{...{ row: { ...row, expected: { cash: '100', cheque: '8' } } as never, corrections }}
			onSaved={done}
			onOpenChange={close}
		/>
	);
	fillCount();
	for (const [tender, value] of [
		['cheque', '8'],
		['voucher', '5'],
		['custom', '6'],
	]) {
		fireEvent.change(screen.getByTestId(`recount-${tender}`), { target: { value } });
	}
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() =>
		expect(post).toHaveBeenCalledWith('closures/server-closure/recount', {
			id: 'client-uuid',
			counted: { cash: '101.25', card: '4', cheque: '8', voucher: '5', custom: '6' },
			reason: 'Found notes',
		})
	);
});

// Revert: omit closeButtonProps.testID, leaving the generated close control untargetable.
it('gives the dialog-generated close control its stable testID', () => {
	mount();
	expect(dialogContent).toHaveBeenLastCalledWith(
		expect.objectContaining({
			closeButtonProps: expect.objectContaining({ testID: 'recount-close' }),
		})
	);
});

// Revert: render currencySymbol before the input instead of the configured prefix/suffix.
it.each([
	['left', '€', ''],
	['left_space', '€ ', ''],
	['right', '', '€'],
	['right_space', '', ' €'],
])('places the amount symbol for %s', (currencyPosition, prefix, suffix) => {
	render(
		<RegisterAmount
			currencyOptions={{ currency: 'EUR', currencyPosition }}
			testID="amount"
			value="10"
			onChangeText={jest.fn()}
		/>
	);
	const input = screen.getByTestId('amount');
	expect(input.previousElementSibling?.textContent ?? '').toBe(prefix);
	expect(input.nextElementSibling?.textContent ?? '').toBe(suffix);
	expect(input.parentElement?.children).toHaveLength(2);
});

// Revert: pass undefined for a null store, selecting bound GBP denominations instead of store zero.
it('uses store zero currency and denominations for a null-store recount', async () => {
	currentCurrency = 'GBP';
	render(
		<RecountSheet row={{ ...row, store_id: null } as never} onSaved={done} onOpenChange={close} />
	);
	fillCount();
	fireEvent.click(screen.getByTestId('recount-denominations'));
	expect(screen.getByTestId('den-tile-100')).toBeTruthy();
	expect(screen.queryByTestId('den-tile-0.20')).toBeNull();
	const coin = screen.getByTestId('den-tile-0.25');
	expect(coin.textContent).toContain('$0.25');
	expect(screen.getByTestId('recount-cash').parentElement?.textContent).toContain('$');
	fireEvent.click(coin);
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() =>
		expect(post).toHaveBeenCalledWith(
			'closures/server-closure/recount',
			expect.objectContaining({ counted: { cash: '0.25', card: '4' } })
		)
	);
});

// Revert: omit the input limit, permitting ordinary typing beyond the server contract.
it('caps the reason input at the server limit', () => {
	mount();
	expect((screen.getByTestId('recount-reason') as HTMLInputElement).maxLength).toBe(500);
});

// Revert: silently disable Save for an over-limit value that bypasses the input cap.
it('explains an over-limit reason beside Save and clears the message after editing', () => {
	mount();
	fillCount();
	fireEvent.change(screen.getByTestId('recount-reason'), { target: { value: 'x'.repeat(501) } });
	const save = screen.getByTestId('recount-save') as HTMLButtonElement;
	expect(save.disabled).toBe(true);
	expect(save.previousElementSibling?.textContent).toBe('Keep the reason to 500 characters');
	fireEvent.change(screen.getByTestId('recount-reason'), { target: { value: 'x'.repeat(500) } });
	expect(save.disabled).toBe(false);
	expect(screen.queryByTestId('recount-reason-error')).toBeNull();
});

// Revert: call onSaved without awaiting its durable write, closing before offline history is saved.
it('keeps the sheet busy until the refreshed snapshot is saved', async () => {
	let finish!: () => void;
	const saved = jest.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	render(<RecountSheet row={row as never} onSaved={saved} onOpenChange={close} />);
	fillCount();
	fireEvent.click(screen.getByTestId('recount-save'));
	await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
	expect(close).not.toHaveBeenCalled();
	expect((screen.getByTestId('recount-save') as HTMLButtonElement).disabled).toBe(true);
	await act(async () => {
		finish();
	});
	expect(close).toHaveBeenCalledWith(false);
});
