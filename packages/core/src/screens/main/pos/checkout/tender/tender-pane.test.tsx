/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { DeviceScope } from '@wcpos/components/lib/device';
import { TONE } from '@wcpos/components/lib/tone';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { method as deviceMethod } from '../payments/device/fixtures.test-utils';
import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { registerDriver } from '../../../../../services/payment-drivers/registry';
import { initialTenderState, tenderReducer } from './tender-state';
import { gatesCheckout } from './checkout-body';
import { splitWith, withFigures } from './tender-figures.test-utils';
import { TenderPane, UnansweredGate } from './tender-pane';
import { LedgerLines } from './ledger-pane';

import type { SplitView } from './split-view';
import type { TenderFlow } from './use-tender-flow';

const mockPush = jest.fn();
const mockBootstrap = jest.fn(async () => ({ token: 'reader-token', method_id: 'device' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		loading,
		onPress,
		variant,
		className,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		loading?: boolean;
		onPress?: () => void;
		variant?: string;
		className?: string;
	}) => (
		// As the real Button: `loading` shows the spinner and makes it inert.
		<button
			className={className}
			data-testid={testID}
			data-variant={variant}
			data-loading={loading ? 'true' : undefined}
			disabled={disabled || loading}
			onClick={onPress}
		>
			{children}
		</button>
	),
	ButtonText: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<span className={className}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/tile', () => ({
	Tile: ({
		children,
		testID,
		disabled,
		selected,
		onPress,
		className,
		title,
		sub,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		selected?: boolean;
		onPress?: () => void;
		className?: string;
		title?: React.ReactNode;
		sub?: React.ReactNode;
	}) => (
		<button
			className={className}
			data-testid={testID}
			data-selected={String(Boolean(selected))}
			disabled={disabled}
			onClick={onPress}
		>
			{children}
			{title}
			{sub}
		</button>
	),
}));
// The real hook answers null for a missing date; the line falls back to its unknown copy then.
jest.mock('../../../hooks/use-date-format', () => ({
	useDateFormat: (date: unknown) => (date === null ? null : 'Oct 8, 10:35 PM'),
}));
// The declared-fields helpers draw host controls; their native deps stay out of jsdom.
type MockCheckboxProps = {
	testID?: string;
	checked?: boolean;
	disabled?: boolean;
	onCheckedChange?: (next: boolean) => void;
};
type MockInputProps = {
	testID?: string;
	value?: string;
	editable?: boolean;
	onChangeText?: (next: string) => void;
};
type MockSelectProps = {
	options: { value: string; label: string }[];
	value?: string;
	placeholder: string;
	onChange?: (next: string) => void;
};
jest.mock('@wcpos/components/checkbox', () => ({
	Checkbox: ({ testID, checked, onCheckedChange, disabled }: MockCheckboxProps) => (
		<input
			type="checkbox"
			data-testid={testID}
			checked={!!checked}
			disabled={disabled}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
		/>
	),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({ testID, value, onChangeText, editable }: MockInputProps) => (
		<input
			data-testid={testID}
			value={value ?? ''}
			disabled={editable === false}
			onChange={(event) => onChangeText?.(event.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/select', () => ({
	OptionSelect: ({ options, value, onChange, placeholder }: MockSelectProps) => (
		<select value={value ?? ''} onChange={(event) => onChange?.(event.target.value)}>
			<option value="">{placeholder}</option>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	),
}));
// The leg view has its own suite; here it only needs to stay out of the saving skeleton's way.
jest.mock('./terminal-leg-view', () => ({ TerminalLegView: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({
		testID,
		label,
		variant,
	}: {
		testID?: string;
		label: string;
		variant: string;
	}) => (
		<span data-testid={testID} data-variant={variant}>
			{label}
		</span>
	),
}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: 'div',
	CollapsibleContent: 'div',
	CollapsibleTrigger: 'div',
}));
jest.mock('@wcpos/components/text', () => ({
	// The real context: the pane renders a real Chip, which provides its ink through it.
	TextClassContext: jest.requireActual('@wcpos/components/text').TextClassContext,
	Text: ({
		children,
		testID,
		className,
		variant,
	}: {
		children?: React.ReactNode;
		testID?: string;
		className?: string;
		variant?: string;
	}) => (
		<span data-testid={testID} data-variant={variant} className={className}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

const method: PaymentMethodDescriptor = {
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	kind: 'cash',
	pos_enabled: true,
	order: 1,
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
	provider_data: {},
};

function makeFlow(count = 1): TenderFlow {
	return withFigures({
		terminal: {
			bootstrapReader: mockBootstrap,
			rememberedReaderId: null,
			rememberReader: jest.fn(async () => {}),
			readers: [],
			lockToDefault: false,
			pickReader: jest.fn(),
			cancelTerminalLeg: jest.fn(),
			releaseTerminalLeg: jest.fn(),
			retryTerminalCapture: jest.fn(),
			dismissTerminalLeg: jest.fn(),
			retryTerminalLeg: jest.fn(),
		},
		commands: {
			dispatch: jest.fn(),
			pickMethod: jest.fn(),
			takeTender: jest.fn(),
			cancelPayment: jest.fn(),
			cancelOnePayment: jest.fn(async () => undefined),
			setFieldValues: jest.fn(),
			cancelInvoice: jest.fn(),
			clearAttempt: jest.fn(),
			retryCommand: jest.fn(async () => undefined),
		},
		state: initialTenderState,
		dp: 2,
		totalMinor: 9295,
		paidMinor: 0,
		balanceMinor: 9295,
		planLabel: null,
		discountMinor: 0,
		rows: [],
		liveRows: [],
		retainedRows: [],
		hasLiveLeg: false,
		terminalLeg: null,
		hasLiveTerminalLeg: false,
		online: true,
		tiles: Array.from({ length: count }, () => ({
			method,
			disabled: false,
			reason: null,
			worksOffline: true,
			settlesLater: false,
		})),
		legacyMethods: [],
		method,
		busy: false,
		running: null,
		saveState: { kind: 'saving' },
		fieldValues: {},
		fieldErrors: {},
		invoiceSent: null,
		unansweredAttempt: null,
		unansweredCommand: false,
		confirmDialog: null,
	});
}
// The pane while saving is the keypad it is about to be, inert: the save settling must not
// swap one layout for another under the cashier's eyes.
it.each([0, 1])('draws the inert keypad while saving (%s tiles)', (count) => {
	const flow = makeFlow(count);
	render(<TenderPane flow={flow} format={String} compact />);
	expect(screen.getByTestId('checkout-keypad')).not.toBeNull();
	expect(screen.getByTestId('checkout-entry').textContent).toBe('9295');
	expect(screen.getByTestId('checkout-commit').textContent).toBe('Saving order…');
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	if (count) {
		expect(screen.getByTestId('checkout-method-pos_cash').hasAttribute('disabled')).toBe(true);
		expect(screen.queryByTestId('checkout-tile-skeleton')).toBeNull();
	} else expect(screen.getAllByTestId('checkout-tile-skeleton')).toHaveLength(4);
	expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
});
it('keeps the plan and unavailable controls inert while saving', () => {
	const base = makeFlow(2);
	base.tiles[1] = {
		...base.tiles[1],
		method: { ...method, id: 'other' },
		disabled: true,
		reason: 'offline',
	};
	const flow = withFigures({
		...base,
		state: { ...base.state, plan: { kind: 'even', ways: 2, from: 0 } },
	});
	render(<TenderPane flow={flow} format={String} compact />);
	for (const id of ['checkout-plan-change', 'checkout-unavailable-toggle'])
		expect(screen.getByTestId(id).hasAttribute('disabled')).toBe(true);
	expect(flow.commands.dispatch).not.toHaveBeenCalled();
});

it('shows one slow notice after four seconds without settling the save', () => {
	jest.useFakeTimers();
	try {
		const flow = makeFlow();
		const { rerender } = render(<TenderPane flow={flow} format={String} />);
		act(() => jest.advanceTimersByTime(3999));
		expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
		act(() => jest.advanceTimersByTime(1));
		expect(screen.getAllByTestId('checkout-save-slow')).toHaveLength(1);
		expect(screen.getByTestId('checkout-method-pos_cash').hasAttribute('disabled')).toBe(true);
		rerender(<TenderPane flow={{ ...flow, saveState: null }} format={String} />);
		rerender(<TenderPane flow={flow} format={String} />);
		expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
	} finally {
		jest.useRealTimers();
	}
});
it('renders the refusal, not a skeleton, for a rejected save', () => {
	render(
		<TenderPane
			flow={{
				...makeFlow(),
				saveState: {
					kind: 'rejected',
					status: 400,
					reason: 'rest_invalid_param',
					message: null,
					refused: null,
					parked: false,
				},
			}}
			format={String}
		/>
	);
	expect(screen.queryByTestId('checkout-tile-skeleton')).toBeNull();
	expect(screen.queryByTestId('checkout-tile-pos_cash')).toBeNull();
	expect(screen.getByTestId('checkout-refused').textContent).toContain('rest_invalid_param');
	expect(screen.getByTestId('checkout-refused-store-health')).toBeTruthy();
});
it('selects methods without committing and folds unavailable reasons', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		state: { ...initialTenderState, methodId: method.id },
		tiles: [
			...makeFlow().tiles,
			{
				method: {
					...method,
					id: 'terminal',
					title: 'Terminal',
					capture: { ...method.capture, mode: 'server' },
				},
				disabled: true,
				reason: 'offline' as const,
				worksOffline: false,
				settlesLater: false,
			},
		],
	};
	render(<TenderPane flow={flow} format={String} />);
	// The picked method is the picked Tile, nothing more: choosing it commits nothing.
	expect(screen.getByTestId('checkout-method-pos_cash').getAttribute('data-selected')).toBe('true');
	fireEvent.click(screen.getByTestId('checkout-method-pos_cash'));
	expect(flow.commands.pickMethod).toHaveBeenCalledWith('pos_cash');
	expect(flow.commands.takeTender).not.toHaveBeenCalled();
	expect(screen.queryByTestId('checkout-method-terminal')).toBeNull();
	expect(screen.queryByTestId('checkout-unavailable-terminal')).toBeNull();
	fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
	expect(screen.getByTestId('checkout-unavailable-terminal').textContent).toContain(
		'Needs a connection'
	);
	fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
	expect(screen.queryByTestId('checkout-unavailable-terminal')).toBeNull();
});

// ADR 0040 §offline: offline tenders do not queue, so a queue-capable
// device tile offline is listed as unavailable, never a pill whose commit button stays dead.
it('lists an offline queue-capable device method as unavailable until offline tenders queue', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		tiles: [
			{
				method: deviceMethod,
				disabled: true,
				reason: 'offline',
				worksOffline: false,
				settlesLater: false,
			},
			// A method that records offline keeps the keypad; with none, the pane is the offline notice.
			{ method, disabled: false, reason: null, worksOffline: true, settlesLater: true },
		],
	};
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.queryByTestId('checkout-method-device')).toBeNull();
	fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
	expect(screen.getByTestId('checkout-unavailable-device').textContent).toContain(
		'Needs a connection'
	);
	expect(flow.commands.pickMethod).not.toHaveBeenCalled();
});

// roadmap#523: a device-only gateway on web says which setting to change and links the docs;
// another reason keeps its one line and no link.
it('links the card reader docs from a device method unavailable on web, and only there', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		tiles: [
			{
				method: deviceMethod,
				disabled: true,
				reason: 'driver_web',
				worksOffline: false,
				settlesLater: false,
			},
			{
				method: { ...deviceMethod, id: 'other_reader', title: 'Other reader' },
				disabled: true,
				reason: 'no_readers',
				worksOffline: false,
				settlesLater: false,
			},
		],
	};
	render(<TenderPane flow={flow} format={String} />);
	fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
	expect(screen.getByTestId('checkout-unavailable-device').textContent).toContain(
		'Allow smart readers on its WooCommerce settings page to pay from this till.'
	);
	expect(screen.getByTestId('checkout-unavailable-device-docs').textContent).toContain(
		'Having trouble?'
	);
	expect(screen.getByTestId('checkout-unavailable-other_reader')).toBeTruthy();
	expect(screen.queryByTestId('checkout-unavailable-other_reader-docs')).toBeNull();
});

// ADR 0040 §1.3: a command sent and never answered gates the checkout; its one action re-sends it.
// A live terminal leg keeps its own view.
it('the unanswered gate re-sends the command, and leaves a live terminal leg its view', () => {
	const flow: TenderFlow = { ...makeFlow(), unansweredCommand: true };
	expect(gatesCheckout(flow)).toBe(true);
	expect(gatesCheckout({ ...flow, terminalLeg: {} as TenderFlow['terminalLeg'] })).toBe(false);
	render(<UnansweredGate flow={flow} />);
	fireEvent.click(screen.getByTestId('checkout-unanswered-retry'));
	expect(flow.commands.retryCommand).toHaveBeenCalledTimes(1);
});

it.each([
	[9295, 9295, 9295, false, 'Take 9295 in Cash'],
	[2000, 2000, 9295, false, 'Take 2000 in Cash · 7295 left'],
	[10000, 9295, 9295, true, 'Take 9295 in Cash'],
	[2000, 2000, 2000, false, 'Take 2000 in Cash · pays it off'],
])(
	'labels the amount and commit for entry %s, applied %s, balance %s',
	(entry, applied, balance, change, label) => {
		const flow = withFigures({
			...makeFlow(),
			saveState: null,
			balanceMinor: balance,
			state: {
				...initialTenderState,
				view: 'amount' as const,
				methodId: method.id,
				entryMinor: entry,
			},
		});
		expect(flow.figures.entryAppliedMinor).toBe(applied);
		expect(flow.figures.entryChangeMinor).toBe(change ? entry - applied : 0);
		render(<TenderPane flow={flow} format={String} />);
		expect(screen.getByTestId('checkout-commit').textContent).toBe(label);
		expect(screen.getByTestId('checkout-label').textContent).toBe(
			`${balance < 9295 ? 'Remaining' : 'To pay'} ${balance}`
		);
		if (change) expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('Change 705');
		if (applied < balance)
			expect(screen.getByTestId('checkout-entry-hint').textContent).toBe(
				'Part payment · 7295 left after this'
			);
		fireEvent.click(screen.getByTestId('checkout-commit'));
		expect(flow.commands.takeTender).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByTestId('checkout-quick-exact'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: balance });
	}
);

it('says the amount once: the eyebrow and Full balance drop it while the entry is the balance', () => {
	const card: PaymentMethodDescriptor = {
		...method,
		id: 'card',
		title: 'Card',
		kind: 'other',
		capabilities: { ...method.capabilities, change: false },
	};
	const flow = withFigures({
		...makeFlow(),
		saveState: null,
		method: card,
		tiles: [
			{ method: card, disabled: false, reason: null, worksOffline: true, settlesLater: false },
		],
		state: { ...initialTenderState, view: 'amount' as const, methodId: card.id, entryMinor: 9295 },
	});
	const { rerender } = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-entry').textContent).toBe('9295');
	expect(screen.getByTestId('checkout-balance').className).toContain('hidden');
	expect(screen.getByTestId('checkout-quick-balance').textContent).toBe('Full balance');
	// The commit keeps its object (buttons are verbs with the object).
	expect(screen.getByTestId('checkout-commit').textContent).toBe('Take 9295 in Card');
	rerender(
		<TenderPane
			flow={withFigures({ ...flow, state: { ...flow.state, entryMinor: 2000 } })}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-balance').className).not.toContain('hidden');
	expect(screen.getByTestId('checkout-quick-balance').textContent).toBe('Full balance 9295');
});

// Cash rounded to the nearest 0.05 (#66, #84).
const rounding: PaymentMethodDescriptor = {
	...method,
	defaults: { ...method.defaults, rounding: { increment: '0.05', mode: 'nearest' } },
};
it.each([
	// 10.03 rounds up to 10.05; 10.02 down to 10.00 (#66, #84).
	[1003, 1005, 1005, '', 'Take 1005 in Cash'],
	[1003, 1005, 2000, 'Change 995', 'Take 1005 in Cash'],
	[1002, 1000, 1000, '', 'Take 1000 in Cash'],
])(
	'shows a cash tender of %s at its rounded due %s (entry %s)',
	(balance, due, entry, hint, label) => {
		const flow: TenderFlow = withFigures({
			...makeFlow(),
			saveState: null,
			method: rounding,
			totalMinor: balance,
			balanceMinor: balance,
			state: { ...initialTenderState, view: 'amount', methodId: method.id, entryMinor: entry },
		});
		expect(flow.figures.roundingMinor).toBe(due - balance);
		expect(flow.figures.entryChangeMinor).toBe(entry - due);
		render(<TenderPane flow={flow} format={String} />);
		expect(screen.getByTestId('checkout-entry').textContent).toBe(String(entry));
		expect(screen.getByTestId('checkout-entry-hint').textContent).toBe(hint);
		expect(screen.getByTestId('checkout-rounded-from').textContent).toBe(`Rounded from ${balance}`);
		expect(screen.getByTestId('checkout-commit').textContent).toBe(label);
		expect(screen.getByTestId('checkout-quick-exact').textContent).toBe(`Exact ${due}`);
		expect(screen.getByTestId(`checkout-quick-${(due / 100).toFixed(2)}`)).not.toBeNull();
		fireEvent.click(screen.getByTestId('checkout-quick-exact'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: due });
	}
);

it('a partial cash entry is not rounded, but the exact chip still offers the rounded due', () => {
	const flow: TenderFlow = withFigures({
		...makeFlow(),
		saveState: null,
		method: rounding,
		totalMinor: 1003,
		balanceMinor: 1003,
		state: { ...initialTenderState, view: 'amount', methodId: method.id, entryMinor: 500 },
	});
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.queryByTestId('checkout-rounded-from')).toBeNull();
	expect(screen.getByTestId('checkout-commit').textContent).toBe('Take 500 in Cash · 503 left');
	expect(screen.getByTestId('checkout-quick-exact').textContent).toBe('Exact 1005');
});

it('an exact unrounded cash entry pays it off, as the hook lets it', () => {
	// Typed: an untouched prefill of the balance is the rounded due, as the hook shows it.
	const flow: TenderFlow = withFigures({
		...makeFlow(),
		saveState: null,
		method: rounding,
		balanceMinor: 1003,
		state: {
			...initialTenderState,
			view: 'amount',
			methodId: method.id,
			entryMinor: 1003,
			entryDirty: true,
		},
	});
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('');
	expect(screen.getByTestId('checkout-commit').textContent).toBe('Take 1003 in Cash · pays it off');
	expect(screen.queryByTestId('checkout-rounded-from')).toBeNull();
});

it('a split share the hook will settle previews the rounded due', () => {
	const flow: TenderFlow = withFigures({
		...makeFlow(),
		saveState: null,
		method: rounding,
		balanceMinor: 1002,
		state: {
			...initialTenderState,
			view: 'amount',
			methodId: method.id,
			entryMinor: 2000,
			plan: { kind: 'fixed', firstMinor: 1001, title: null, from: 0 },
		},
	});
	expect(flow.figures.thisPaymentMinor).toBe(1001);
	expect(flow.figures.roundingMinor).toBe(-2);
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('Change 1000');
	expect(screen.getByTestId('checkout-rounded-from').textContent).toBe('Rounded from 1002');
	expect(screen.getByTestId('checkout-commit').textContent).toMatch(/^Take 1000 in Cash/);
});

it('blocks no-change over-tender and restores full balance from a partial entry', () => {
	const card = {
		...method,
		title: 'Card',
		capabilities: { ...method.capabilities, change: false },
	};
	const flow = withFigures({
		...makeFlow(),
		saveState: null,
		method: card,
		state: { ...initialTenderState, methodId: method.id, entryMinor: 10000 },
	});
	const { rerender } = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe(
		"Only 9295 is due — Card can't give change"
	);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	fireEvent.click(screen.getByTestId('checkout-commit'));
	expect(flow.commands.takeTender).not.toHaveBeenCalled();
	rerender(
		<TenderPane
			flow={withFigures({ ...flow, state: { ...flow.state, entryMinor: 2000 } })}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	fireEvent.click(screen.getByTestId('checkout-quick-balance'));
	expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: 9295 });
});

it('shows plan legs, labels, a short entry hint and numbered commit tail', () => {
	const flow: TenderFlow = withFigures(
		{
			...makeFlow(),
			saveState: null,
			planLabel: 'Payment 2 of 3',
			rows: [
				{
					id: 'r1',
					method_id: 'pos_card',
					amount: '1.00',
					status: 'captured',
				} as TenderFlow['rows'][number],
			],
			balanceMinor: 900,
			state: {
				...initialTenderState,
				view: 'amount',
				entryMinor: 200,
				entryDirty: true,
				plan: { kind: 'even', ways: 3, from: 0 },
			},
		},
		{ titleOf: (id) => (id === 'pos_card' ? 'Card' : id) }
	);
	expect(flow.figures.legs).toEqual([
		{ minor: 100, state: 'done', title: 'Card' },
		{ minor: 450, state: 'now' },
		{ minor: 450, state: 'todo' },
	]);
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-label').textContent).toContain('Payment 2 of 3 · 900 left');
	expect(screen.getByTestId('checkout-plan-done').textContent).toContain('Card 100');
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe(
		'Less than planned · 250 moves to the next payment'
	);
	expect(screen.getByTestId('checkout-commit').textContent).toContain(' · 2 of 3');
	// Change split keeps Split on: the even row comes back over what is left.
	fireEvent.click(screen.getByTestId('checkout-plan-change'));
	expect(flow.commands.dispatch).toHaveBeenLastCalledWith({
		type: 'clear-plan',
		balanceMinor: 900,
		keepSplit: true,
	});
});
it('renders a paid line badge beside an items plan', () => {
	const flow: TenderFlow = withFigures({
		...makeFlow(),
		saveState: null,
		planLabel: 'Rest of the order',
		state: {
			...initialTenderState,
			plan: { kind: 'items', ways: 1, firstMinor: 100, units: { 1: 1 }, from: 0 },
		},
	});
	render(
		<>
			<TenderPane flow={flow} format={String} />
			<LedgerLines
				lines={[{ id: 1, name: 'Belt', quantity: 2 }]}
				totalMinor={600}
				format={String}
				paid={{ 1: { units: 1, methods: ['Card', 'SumUp'] } }}
			/>
		</>
	);
	expect(screen.queryByTestId('checkout-plan-pick-items')).toBeNull();
	expect(screen.getByText('1 of 2 paid · Card + SumUp')).toBeTruthy();
});

it('keeps the keypad visible without a method and disables commit', () => {
	render(
		<TenderPane
			flow={withFigures({ ...makeFlow(), method: null, saveState: null, online: false })}
			format={String}
			compact
		/>
	);
	expect(screen.getByTestId('checkout-keypad')).toBeTruthy();
	expect(screen.getByTestId('checkout-commit').textContent).toBe(
		'Choose how the customer is paying'
	);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	expect(screen.getByTestId('checkout-offline').textContent).toBe('Offline');
});

it.each([1, 2])('collapses a preselected reader (%s readers)', (count) => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		method: { ...method, capture: { ...method.capture, mode: 'server' } },
		state: { ...initialTenderState, methodId: method.id, readerId: 'b' },
	};
	flow.terminal = {
		...flow.terminal,
		readers: [
			{ id: 'b', label: 'Back', isDefault: false, inUseBy: null },
			{ id: 'a', label: 'Front', isDefault: true, inUseBy: null },
		].slice(0, count),
	};
	const { rerender } = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-reader-selected').textContent).toBe('Terminal: Back');
	expect(screen.queryByTestId('checkout-reader-b')).toBeNull();
	expect(screen.queryByTestId('checkout-reader-a')).toBeNull();
	if (count === 1) expect(screen.queryByTestId('checkout-reader-change')).toBeNull();
	else {
		expect(screen.getByTestId('checkout-reader-change').textContent).toBe('Change');
		fireEvent.click(screen.getByTestId('checkout-reader-change'));
		expect(screen.getByTestId('checkout-reader-b')).toBeTruthy();
		expect(screen.getByTestId('checkout-reader-a')).toBeTruthy();
		rerender(<TenderPane flow={{ ...flow, method: null }} format={String} />);
		rerender(<TenderPane flow={flow} format={String} />);
		expect(screen.getByTestId('checkout-reader-change')).toBeTruthy();
	}
});
it('the pay sheet shows one reader line: a link to Settings until a reader is connected', async () => {
	// Scanning, errors and Disconnect live on Settings → Card readers (roadmap#407).
	const driver = createSimulatedDriver();
	registerDriver(driver);
	const base = makeFlow();
	const flow = withFigures({
		...base,
		saveState: null,
		method: deviceMethod,
		tiles: [
			{
				method: deviceMethod,
				disabled: false,
				reason: null,
				worksOffline: false,
				settlesLater: false,
			},
		],
		terminal: {
			...base.terminal,
			deviceTransport: 'bluetooth' as const,
			pickTransport: jest.fn(),
			deviceReady: false,
		},
		// The battery shows on the selected tile only.
		state: { ...initialTenderState, methodId: deviceMethod.id, entryMinor: 1000 },
	});
	const rendered = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-reader-status').textContent).toContain('No reader connected');
	expect(screen.queryByTestId(`checkout-method-dot-${deviceMethod.id}`)).toBeNull();
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	expect(screen.queryByTestId('checkout-reader-connect')).toBeNull();
	expect(screen.queryByTestId('checkout-transport-tap_to_pay')).toBeNull();
	fireEvent.click(screen.getByTestId('checkout-reader-settings-link'));
	expect(mockPush).toHaveBeenCalledWith('/settings/card-readers');
	await act(async () => {
		await driver.connect!(
			{ id: 'sim-approve', label: 'Simulated approve', battery: 82, transport: 'bluetooth' },
			null
		);
	});
	expect(screen.getByTestId('checkout-reader-status').textContent).toBe(
		'Simulated approve · Connected · 82%'
	);
	expect(screen.queryByTestId('checkout-reader-settings-link')).toBeNull();
	expect(screen.getByTestId(`checkout-method-status-${deviceMethod.id}`).textContent).toContain(
		'82%'
	);
	expect(
		screen.getByTestId(`checkout-method-status-${deviceMethod.id}`).getAttribute('data-variant')
	).toBe('help');
	expect(screen.getByTestId(`checkout-method-dot-${deviceMethod.id}`).className).toContain(
		'bg-success'
	);
	rendered.rerender(
		<TenderPane
			flow={{ ...flow, terminal: { ...flow.terminal, deviceReady: true } }}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	await act(async () => {
		await driver.disconnect!();
	});
});

it('names the connected reader as Settings → Card readers does, never the SDK key or serial', async () => {
	const driver = createSimulatedDriver();
	registerDriver(driver);
	const tile = {
		method: deviceMethod,
		disabled: false,
		reason: null,
		worksOffline: false,
		settlesLater: false,
	};
	const base = makeFlow();
	const flow = {
		...base,
		saveState: null,
		method: deviceMethod,
		tiles: [tile],
		terminal: { ...base.terminal, deviceTransport: 'bluetooth' as const, pickTransport: jest.fn() },
	};
	render(<TenderPane flow={flow} format={String} />);
	await act(async () => {
		await driver.connect!(
			{
				id: 'WPC323211047061',
				label: 'WPC323211047061',
				model: 'wisePad3',
				serial: 'WPC323211047061',
				battery: 74,
				transport: 'bluetooth',
			},
			null
		);
	});
	expect(screen.getByTestId('checkout-reader-status').textContent).toBe(
		'WisePad 3 · Connected · 74%'
	);
	// Not the selected tile: the dot says connected, the battery stays on the reader line.
	expect(screen.getByTestId(`checkout-method-dot-${deviceMethod.id}`)).toBeTruthy();
	expect(screen.queryByTestId(`checkout-method-status-${deviceMethod.id}`)).toBeNull();
	await act(async () => {
		await driver.disconnect!();
	});
});

it.each(['discovery', 'bootstrap'] as const)(
	'restarts superseded %s without leaving controls disabled',
	async (stage) => {
		const reader = { id: 'remembered', label: 'Remembered', transport: 'bluetooth' as const };
		let resolve!: () => void;
		const pending = new Promise<void>((yes) => {
			resolve = yes;
		});
		const discoverReaders = jest.fn(async () => [reader]);
		const bootstrapReader = jest.fn(async () => ({ token: 'new' }));
		if (stage === 'discovery')
			discoverReaders.mockImplementationOnce(async () => {
				await pending;
				return [reader];
			});
		else
			bootstrapReader.mockImplementationOnce(async () => {
				await pending;
				return { token: 'old' };
			});
		const connect = jest.fn(async () => {});
		registerDriver({ ...createSimulatedDriver(), discoverReaders, connect });
		const base = makeFlow();
		const flow = {
			...base,
			saveState: null,
			method: deviceMethod,
			terminal: {
				...base.terminal,
				rememberedReaderId: 'remembered',
				pickTransport: jest.fn(),
				bootstrapReader,
				deviceTransport: 'bluetooth' as const,
			},
		};
		const rendered = render(<TenderPane flow={flow} format={String} />);
		await act(async () => {});
		// While the remembered reader reconnects the line says so and offers no link.
		expect(screen.getByTestId('checkout-reader-status').textContent).toBe('Connecting…');
		expect(screen.queryByTestId('checkout-reader-settings-link')).toBeNull();
		await act(async () => {
			rendered.rerender(<TenderPane flow={{ ...flow, online: false }} format={String} />);
		});
		expect(screen.getByTestId('checkout-reader-status').textContent).toBe('No reader connected');
		expect(connect).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenLastCalledWith(reader, null);
		await act(async () => {
			resolve();
			await pending;
		});
		expect(connect).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('checkout-reader-status').textContent).toBe('No reader connected');
		rendered.unmount();
	}
);

it('uses a remembered reader the driver already holds without a discovery (no re-pair)', async () => {
	const reader = { id: 'remembered', label: 'Remembered', transport: 'bluetooth' as const };
	const discoverReaders = jest.fn(async () => [reader]);
	const connect = jest.fn(async () => {});
	const base = createSimulatedDriver();
	registerDriver({
		...base,
		discoverReaders,
		connect,
		status$: {
			get: () => ({ ...base.status$.get(), connection: 'connected' as const, reader }),
			subscribe: base.status$.subscribe,
		},
	});
	const pickTransport = jest.fn();
	const flow = {
		...makeFlow(),
		saveState: null,
		method: deviceMethod,
	};
	flow.terminal = {
		...flow.terminal,
		rememberedReaderId: 'remembered',
		pickTransport,
		bootstrapReader: jest.fn(async () => ({ token: 'new' })),
		deviceTransport: 'bluetooth' as const,
	};
	const rendered = render(<TenderPane flow={flow} format={String} />);
	await act(async () => {});
	// Connected from Settings: the sheet takes the reader as it is. A discovery would have
	// dropped it (the SDK refuses to scan while connected) and re-paired it seconds later.
	expect(discoverReaders).not.toHaveBeenCalled();
	expect(connect).not.toHaveBeenCalled();
	expect(pickTransport).toHaveBeenCalledWith('bluetooth');
	rendered.unmount();
});

it('keeps typed entry when switching methods without taking money', () => {
	const state = tenderReducer(
		{ ...initialTenderState, view: 'amount', methodId: 'cash', entryMinor: 2000, entryDirty: true },
		{ type: 'pick-method', methodId: 'card', prefillMinor: 9295, readerId: null }
	);
	expect(state.methodId).toBe('card');
	expect(state.entryMinor).toBe(2000);
	expect(state.entryDirty).toBe(true);
});

it('does not cap manual card at the planned split share', () => {
	const flow: TenderFlow = withFigures({
		...makeFlow(),
		saveState: null,
		balanceMinor: 2000,
		method: { ...method, title: 'Card', capabilities: { ...method.capabilities, change: false } },
		state: {
			...initialTenderState,
			methodId: method.id,
			entryMinor: 1500,
			plan: { kind: 'even', ways: 2, from: 0 },
		},
	});
	expect(flow.figures.thisPaymentMinor).toBe(1000);
	expect(flow.figures.entryAppliedMinor).toBe(1500);
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('');
	expect(screen.getByTestId('checkout-quick-balance').textContent).toBe('Exact 1000');
});

it('keeps fixed plans numbered out of two, but stops numbering a completed item group', () => {
	const flow: TenderFlow = withFigures({
		...makeFlow(),
		saveState: null,
		balanceMinor: 1,
		state: { ...initialTenderState, plan: { kind: 'fixed', firstMinor: 1, title: null, from: 0 } },
	});
	const { rerender } = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-commit').textContent).toContain(' · 1 of 2');
	rerender(
		<TenderPane
			flow={withFigures({
				...flow,
				rows: [
					{
						id: 'r1',
						method_id: 'pos_cash',
						amount: '1.00',
						status: 'captured',
					} as TenderFlow['rows'][number],
				],
				state: {
					...flow.state,
					plan: { kind: 'items', firstMinor: 100, units: { 1: 1 }, ways: 1, from: 0 },
				},
			})}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-commit').textContent).toContain(' · pays it off');
});

it('preserves every keypad selector and dispatches the original key action', () => {
	const flow = { ...makeFlow(), saveState: null };
	render(<TenderPane flow={flow} format={String} />);
	for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace']) {
		expect(screen.getByTestId(`checkout-keypad-key-${key}`)).toBeTruthy();
	}
	fireEvent.click(screen.getByTestId('checkout-keypad-key-5'));
	expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'key', key: '5' });
});

describe('split V1: the pane builds each payment', () => {
	const lines = [
		{ id: 'l1', name: 'Lemonade', quantity: 4, totalMinor: 2000 },
		{ id: 'l2', name: 'Fish &amp; chips', quantity: 3, totalMinor: 6600 },
	];
	const row = (id: string, amount: string, method_id = 'pos_cash') =>
		({ id, method_id, amount, status: 'captured', kind: 'cash' }) as TenderFlow['rows'][number];
	// A plan given with the flow is the reducer's: the figures derive its legs and numbering.
	const splitFlow = (
		{
			picked = {},
			paidUnits = {},
			allocations = {},
			splitOn = true,
			plan = null,
			...over
		}: Partial<Omit<TenderFlow, 'state' | 'figures' | 'split'>> &
			Partial<Pick<SplitView, 'picked' | 'paidUnits' | 'allocations' | 'splitOn'>> & {
				plan?: TenderFlow['state']['plan'];
			} = {},
		state: Partial<TenderFlow['state']> = {}
	): TenderFlow =>
		withFigures({
			...makeFlow(),
			saveState: null,
			totalMinor: 18250,
			balanceMinor: 18250,
			split: splitWith({ lines, picked, paidUnits, allocations, splitOn }),
			...over,
			state: {
				...initialTenderState,
				view: 'amount',
				methodId: method.id,
				entryMinor: 18250,
				plan,
				...state,
			},
		});
	const text = (id: string) => screen.getByTestId(id).textContent;
	const pressed = (id: string) => screen.getByTestId(id).getAttribute('aria-pressed');

	// Paul, 2026-11-08 ("as you recommend (a)"): the six tiles are one strip that scrolls sideways,
	// never a second row that pushes the keypad down.
	it('Split on puts Percent and the five ways in one horizontal strip that scrolls', () => {
		render(<TenderPane flow={splitFlow()} format={String} />);
		const strip = screen.getByTestId('checkout-split-ways');
		expect(strip.hasAttribute('data-horizontal')).toBe(true);
		expect(strip.dataset.contentClasses?.split(' ')).toEqual(
			expect.arrayContaining(['grow', 'gap-2'])
		);
		const ids = ['checkout-percent', ...[2, 3, 4, 5, 6].map((ways) => `checkout-even-${ways}`)];
		for (const id of ids) {
			const tile = screen.getByTestId(id);
			expect(strip.contains(tile)).toBe(true);
			// Each tile's cell shares the row and never drops under 112.
			expect(tile.parentElement?.className.split(' ')).toEqual(
				expect.arrayContaining(['min-w-28', 'flex-1'])
			);
		}
		expect(strip.children).toHaveLength(6);
		// The strip holds its own line in the wrapping helpers row: a full-width plain wrapper.
		expect(strip.parentElement?.className).toBe('w-full');
		expect(strip.className).not.toContain('w-full');
	});

	it('Split on shows the even row, Percent and five ways, and no sub-view', () => {
		const flow = splitFlow();
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-helpers')).toContain('Split the rest');
		expect(text('checkout-percent')).toBe('Percenta share');
		for (const ways of [2, 3, 4, 5, 6])
			expect(text(`checkout-even-${ways}`)).toContain(`${ways} ways`);
		// Half-up shares: 182.50 / 4 is 45.63 (the last pays 45.61).
		expect(text('checkout-even-4')).toBe('4 ways4563 each');
		expect(screen.queryByTestId('checkout-split-tab-even')).toBeNull();
		expect(screen.getByTestId('checkout-keypad')).toBeTruthy();
		expect(pressed('checkout-split-chip')).toBe('true');
		fireEvent.click(screen.getByTestId('checkout-even-4'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'set-plan',
			plan: { kind: 'even', ways: 4, from: 0 },
			balanceMinor: 18250,
		});
	});

	it('an amount typed divides what is left after it, and 3 ways plans it plus three payments', () => {
		const flow = splitFlow({}, { entryMinor: 2000, entryDirty: true });
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-helpers')).toContain('After this payment · 16250');
		expect(text('checkout-even-3')).toBe('3 ways5417 each');
		fireEvent.click(screen.getByTestId('checkout-even-3'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'set-plan',
			plan: { kind: 'fixed', firstMinor: 2000, title: null, thenWays: 3, from: 0 },
			balanceMinor: 18250,
		});
	});

	it('Percent then 25 % shows 25 % of the balance as the payment', () => {
		const flow = splitFlow();
		const { rerender } = render(<TenderPane flow={flow} format={String} />);
		fireEvent.click(screen.getByTestId('checkout-percent'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'set-entry-mode',
			mode: 'percent',
		});
		const typing = splitFlow({}, { entryMode: 'percent', entryMinor: 0 });
		rerender(<TenderPane flow={typing} format={String} />);
		expect(text('checkout-helpers')).toContain('Percent of the rest');
		expect(pressed('checkout-percent-type')).toBe('true');
		expect(screen.queryByTestId('checkout-even-2')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-percent-25'));
		expect(typing.commands.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: 25 });
		// The flow derives the money: the reducer's entry is the share.
		const share = splitFlow({}, { entryMode: 'percent', entryMinor: 25 });
		rerender(<TenderPane flow={share} format={String} />);
		expect(text('checkout-entry')).toBe('4563');
		expect(text('checkout-entry-hint')).toBe('25 % of 18250 · type another share');
		expect(pressed('checkout-percent-25')).toBe('true');
		expect(pressed('checkout-percent-type')).toBe('false');
		fireEvent.click(screen.getByTestId('checkout-percent-type'));
		expect(share.commands.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: 0 });
	});

	it('picked lines show their leg chips, + amount and Share', () => {
		const flow = splitFlow({ picked: { l1: 3, l2: 1 } });
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-leg-l1')).toBe('3 Lemonade');
		expect(text('checkout-leg-l2')).toBe('1 Fish & chips');
		expect(text('checkout-plus-amount')).toBe('+ amount');
		expect(text('checkout-share')).toBe('Share');
		expect(screen.queryByTestId('checkout-even-2')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-leg-l1-action'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'pick-units',
			lineId: 'l1',
			units: 0,
		});
		fireEvent.click(screen.getByTestId('checkout-plus-amount'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'arm-extra' });
		fireEvent.click(screen.getByTestId('checkout-share'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'toggle-share' });
	});

	it('Share then 3 ways plans the picked units shared three ways', () => {
		const flow = splitFlow({ picked: { l1: 3, l2: 1 } }, { shareOpen: true, extraMinor: 0 });
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-helpers')).toContain('Share this payment');
		expect(text('checkout-plus-amount')).toBe('+ 0');
		expect(text('checkout-share-3')).toBe('3 ways · 1233 each');
		fireEvent.click(screen.getByTestId('checkout-share-3'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'set-plan',
			plan: {
				kind: 'items',
				units: { l1: 3, l2: 1 },
				firstMinor: 3700,
				ways: 3,
				from: 0,
			},
			balanceMinor: 18250,
		});
	});

	it('on a phone, Pick items puts the lines in the keypad’s place, and Back to keypad restores it', () => {
		const paid = { l2: { units: 1, methods: ['Card'] } };
		const flow = splitFlow({ paidUnits: paid });
		const { rerender } = render(
			<DeviceScope phone>
				<TenderPane flow={flow} format={String} />
			</DeviceScope>
		);
		expect(text('checkout-pick-items')).toBe('Pick items');
		expect(screen.queryByTestId('checkout-pick-list')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-pick-items'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'toggle-picker' });
		const open = splitFlow({ paidUnits: paid, picked: { l1: 2 } }, { pickerOpen: true });
		rerender(
			<DeviceScope phone>
				<TenderPane flow={open} format={String} />
			</DeviceScope>
		);
		expect(screen.queryByTestId('checkout-keypad')).toBeNull();
		expect(text('checkout-pick-items')).toBe('Back to keypad2');
		expect(text('checkout-line-l1-pick')).toContain('Lemonade');
		expect(text('checkout-line-l1-pick')).toContain('500 each');
		expect(text('checkout-line-l1-units')).toBe('2 of 4');
		// The picks are the entry too (the big figure says 1000): the line's own price is in the list.
		expect(within(screen.getByTestId('checkout-pick-list')).getByText('1000')).toBeTruthy();
		expect(text('checkout-line-l2-pick')).toContain('Fish & chips');
		expect(text('checkout-line-l2-pick')).toContain('1 of 3 paid · Card');
		expect(text('checkout-line-l2-units')).toBe('0 of 2');
		expect(screen.getByTestId('checkout-line-l2-minus').getAttribute('aria-disabled')).toBe('true');
		fireEvent.click(screen.getByTestId('checkout-line-l1-plus'));
		expect(open.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'pick-units',
			lineId: 'l1',
			units: 3,
		});
		fireEvent.click(screen.getByTestId('checkout-line-l2-pick'));
		expect(open.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'pick-units',
			lineId: 'l2',
			units: 2,
		});
		rerender(
			<DeviceScope phone>
				<TenderPane
					flow={{ ...open, state: { ...open.state, pickerOpen: false } }}
					format={String}
				/>
			</DeviceScope>
		);
		expect(screen.getByTestId('checkout-keypad')).toBeTruthy();
		expect(screen.queryByTestId('checkout-pick-list')).toBeNull();
	});

	it('the tablet has no pick list: the bill is the picker', () => {
		render(
			<DeviceScope phone={false}>
				<TenderPane flow={splitFlow({}, { pickerOpen: true })} format={String} />
			</DeviceScope>
		);
		expect(screen.queryByTestId('checkout-pick-items')).toBeNull();
		expect(screen.queryByTestId('checkout-pick-list')).toBeNull();
		expect(screen.getByTestId('checkout-keypad')).toBeTruthy();
	});

	it('picks on a discounted order say the prices include the discount', () => {
		const { rerender } = render(
			<TenderPane flow={splitFlow({ discountMinor: 1825 })} format={String} />
		);
		expect(screen.queryByTestId('checkout-discount-note')).toBeNull();
		const picks = { picked: { l1: 1 } };
		rerender(<TenderPane flow={splitFlow({ ...picks, discountMinor: 1825 })} format={String} />);
		expect(text('checkout-discount-note')).toBe('Prices include the discount');
		rerender(<TenderPane flow={splitFlow(picks)} format={String} />);
		expect(screen.queryByTestId('checkout-discount-note')).toBeNull();
	});

	it('three payments taken fold into one pill that unfolds into them, each cancellable', () => {
		const rows = [row('a', '23.00'), row('b', '15.00'), row('c', '20.00')];
		const over = { rows, paidMinor: 5800, balanceMinor: 12450, allocations: { b: { l1: 1 } } };
		const flow = splitFlow(over);
		const { rerender } = render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-label')).toContain('Payment 4 · 12450 left');
		expect(text('checkout-plan-done')).toBe('3 paid · 5800');
		expect(screen.queryByTestId('checkout-plan-leg-0')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-plan-done'));
		expect(flow.commands.dispatch).toHaveBeenLastCalledWith({ type: 'toggle-done' });
		const open = splitFlow(over, { doneOpen: true });
		rerender(<TenderPane flow={open} format={String} />);
		expect(text('checkout-plan-payment-1')).toContain('Cash · 1500');
		expect(text('checkout-plan-payment-1')).toContain('1 Lemonade');
		expect(screen.queryByTestId('checkout-keypad')).toBeNull();
		expect(screen.queryByTestId('checkout-helpers')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-plan-payment-1-cancel'));
		expect(open.commands.cancelOnePayment).toHaveBeenCalledWith('b');
		expect(text('checkout-plan-payment-1-cancel')).toBe('Cancel payment');
		fireEvent.click(screen.getByTestId('checkout-plan-hide'));
		expect(open.commands.dispatch).toHaveBeenLastCalledWith({ type: 'toggle-done' });
		rerender(<TenderPane flow={splitFlow(over)} format={String} />);
		expect(screen.getByTestId('checkout-keypad')).toBeTruthy();
		expect(screen.getByTestId('checkout-helpers')).toBeTruthy();
	});

	it('runs of equal payments to come read Then n × amount', () => {
		const flow = splitFlow({
			plan: { kind: 'even', ways: 3, from: 0 },
			planLabel: 'Payment 1 of 3',
		});
		expect(flow.figures.legs).toEqual([
			{ minor: 6083, state: 'now' },
			{ minor: 6083, state: 'todo' },
			{ minor: 6084, state: 'todo' },
		]);
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-plan-leg-1')).toBe('6083');
		expect(text('checkout-plan-leg-2')).toBe('6084');
		const even = splitFlow({
			balanceMinor: 200,
			plan: { kind: 'fixed', firstMinor: 100, title: null, thenWays: 2, from: 0 },
		});
		expect(even.figures.legs).toEqual([
			{ minor: 100, state: 'now' },
			{ minor: 50, state: 'todo' },
			{ minor: 50, state: 'todo' },
		]);
		render(<TenderPane flow={even} format={String} />);
		expect(screen.getAllByTestId('checkout-plan-leg-1').at(-1)?.textContent).toBe('Then 2 × 50');
	});

	// S10 (Paul's table): A and B are taken, then C plans $20.00 and 3 ways; numbering is bill-wide.
	const s10 = { kind: 'fixed', firstMinor: 2000, title: null, thenWays: 3, from: 2 } as const;
	const ab = [row('a', '23.00', 'pos_card'), row('b', '15.00')];
	it('a failed row before the plan is not a payment: the bill-wide total skips it (Greptile on #3405)', () => {
		const failed = { ...row('x', '23.00', 'pos_card'), status: 'failed' as const };
		const flow = splitFlow(
			{
				rows: [failed, ...ab],
				paidMinor: 3800,
				balanceMinor: 14450,
				plan: { ...s10, from: 3 },
			},
			{ entryMinor: 2000, entryDirty: true }
		);
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-commit')).toBe('Take 2000 in Cash · 3 of 6');
	});

	it('S10 C reads 3 of 6, its taken payments folded and the three to come as one pill', () => {
		const flow = splitFlow(
			{
				rows: ab,
				paidMinor: 3800,
				balanceMinor: 14450,
				plan: s10,
			},
			{ entryMinor: 2000, entryDirty: true }
		);
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-commit')).toBe('Take 2000 in Cash · 3 of 6');
		expect(text('checkout-plan-done')).toBe('2 paid · 3800');
		expect(text('checkout-plan-leg-3')).toBe('Then 3 × 4150');
	});

	it('S10 D reads 4 of 6, and a short D moves the difference to payments 5 and 6', () => {
		const over = {
			rows: [...ab, row('c', '20.00')],
			paidMinor: 5800,
			balanceMinor: 12450,
			plan: s10,
		};
		const { rerender } = render(
			<TenderPane flow={splitFlow(over, { entryMinor: 4150 })} format={String} />
		);
		expect(text('checkout-commit')).toBe('Take 4150 in Cash · 4 of 6');
		rerender(
			<TenderPane flow={splitFlow(over, { entryMinor: 4000, entryDirty: true })} format={String} />
		);
		expect(text('checkout-entry-hint')).toBe('Less than planned · 150 moves to payments 5 and 6');
	});

	it('less than planned with three or more to come names how many', () => {
		const flow = splitFlow(
			{ plan: { kind: 'even', ways: 4, from: 0 } },
			{ entryMinor: 4000, entryDirty: true }
		);
		render(<TenderPane flow={flow} format={String} />);
		expect(text('checkout-entry-hint')).toBe(
			'Less than planned · 563 moves to the next 3 payments'
		);
		expect(text('checkout-commit')).toBe('Take 4000 in Cash · 1 of 4');
	});

	it('the Split chip turns Split on, and off clears the plan', () => {
		const off = splitFlow({ splitOn: false });
		const { rerender } = render(<TenderPane flow={off} format={String} />);
		expect(pressed('checkout-split-chip')).toBe('false');
		expect(screen.queryByTestId('checkout-even-2')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-split-chip'));
		expect(off.commands.dispatch).toHaveBeenLastCalledWith({ type: 'split-on' });
		const on = splitFlow({ plan: { kind: 'even', ways: 2, from: 0 } });
		rerender(<TenderPane flow={on} format={String} />);
		fireEvent.click(screen.getByTestId('checkout-split-chip'));
		expect(on.commands.dispatch).toHaveBeenLastCalledWith({
			type: 'clear-plan',
			balanceMinor: 18250,
		});
	});

	it('draws the plan strip after the method grid', () => {
		render(<TenderPane flow={splitFlow({ rows: [row('a', '23.00')] })} format={String} />);
		const methods = screen.getByTestId('checkout-method-pos_cash');
		const strip = screen.getByTestId('checkout-plan');
		expect(methods.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		// A lone taken payment is the disclosure pill too, so it can be cancelled (Codex on #3405).
		expect(text('checkout-plan-done')).toBe('Cash 2300');
	});
});

jest.mock('uniwind', () => ({
	useCSSVariable: (name: string) =>
		name === '--spacing-tile' ? 64 : name === '--spacing-ctl' ? 44 : 'currentColor',
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'svg', Circle: 'circle' }));
jest.mock('../../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '14:04' }),
}));

const mockLayouts: Record<
	string,
	(event: { nativeEvent: { layout: { height?: number; y?: number } } }) => void
> = {};
const mockContentStyles: Record<string, unknown> = {};
const mockContentSizes: Record<string, (width: number, height: number) => void> = {};
jest.mock('react-native', () => {
	const native = jest.requireActual('react-native');
	function Box({
		children,
		testID,
		className,
		onLayout,
		onContentSizeChange,
		contentContainerStyle,
		horizontal,
		contentContainerClassName,
	}: React.PropsWithChildren<{
		testID?: string;
		className?: string;
		onLayout?: (typeof mockLayouts)[string];
		onContentSizeChange?: (typeof mockContentSizes)[string];
		contentContainerStyle?: unknown;
		horizontal?: boolean;
		contentContainerClassName?: string;
	}>) {
		// The jsdom host has no layout engine; expose its committed layout callback to the test.
		React.useLayoutEffect(() => {
			if (testID && onLayout) mockLayouts[testID] = onLayout;
		}, [testID, onLayout]);
		// And its content size callback, the same way.
		React.useLayoutEffect(() => {
			if (testID && onContentSizeChange) mockContentSizes[testID] = onContentSizeChange;
		}, [testID, onContentSizeChange]);
		// And the content container's committed style (the pane's fit).
		React.useLayoutEffect(() => {
			if (testID && contentContainerStyle) mockContentStyles[testID] = contentContainerStyle;
		}, [testID, contentContainerStyle]);
		return (
			<div
				data-testid={testID}
				className={className}
				data-horizontal={horizontal ? '' : undefined}
				data-content-classes={contentContainerClassName}
			>
				{children}
			</div>
		);
	}
	return { ...native, View: Box, ScrollView: Box };
});
it('shrinks the shared keypad under a short measured pane and restores tile fit', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	act(() => {
		mockLayouts['checkout-keypad']({ nativeEvent: { layout: { height: 280 } } });
		mockContentSizes['checkout-keypad-pane'](0, 480);
		mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 400 } } });
	});
	expect(screen.getByTestId('checkout-keypad').className).toContain('min-h-0');
	act(() => mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 900 } } }));
	expect(screen.getByTestId('checkout-keypad').className).not.toContain('min-h-0');
});

// A native ScrollView scrolls only to its content container's height: content taller than the
// fit (Split's "N ways" tiles wrapping) must grow the container, so it is a floor, never a height.
it('the shrunk pane floors its content at the fit and never fixes its height, so overflow scrolls', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	act(() => {
		mockLayouts['checkout-keypad']({ nativeEvent: { layout: { height: 280 } } });
		mockContentSizes['checkout-keypad-pane'](0, 480);
		mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 400 } } });
	});
	expect(screen.getByTestId('checkout-keypad').className).toContain('min-h-0');
	const style = mockContentStyles['checkout-keypad-pane'] as Record<string, unknown>;
	expect(style).not.toHaveProperty('height');
	expect(style.minHeight).toBeGreaterThanOrEqual(400);
});

it('the commit bar sits outside the keypad scroll, so it never scrolls off', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	expect(screen.getByTestId('checkout-commit')).toBeTruthy();
	expect(
		screen.getByTestId('checkout-keypad-pane').contains(screen.getByTestId('checkout-commit'))
	).toBe(false);
});

// Tile fit: keypad y 200 + 3 gaps of 8 + 4 rows of 64 = 480, with no foot inside the scroll.
it('the keypad keeps tile keys while the scroll fits them, the bar no longer counted', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	act(() => {
		mockLayouts['checkout-keypad']({ nativeEvent: { layout: { height: 280 } } });
		mockContentSizes['checkout-keypad-pane'](0, 480);
		mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 480 } } });
	});
	expect(screen.getByTestId('checkout-keypad').className).not.toContain('min-h-0');
	act(() => mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 479 } } }));
	expect(screen.getByTestId('checkout-keypad').className).toContain('min-h-0');
});

// Control floor: keypad y 200 + 3 gaps of 8 + 4 rows of 44 = 400.
it('the shrunk scroll floors its content at the control-height fit', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	act(() => {
		mockLayouts['checkout-keypad']({ nativeEvent: { layout: { height: 280 } } });
		mockContentSizes['checkout-keypad-pane'](0, 480);
		mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 300 } } });
	});
	const style = mockContentStyles['checkout-keypad-pane'] as Record<string, unknown>;
	expect(style.minHeight).toBe(400);
});

it('a row added above the keypad shrinks it with no keypad layout event (web)', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	act(() => {
		mockLayouts['checkout-keypad']({ nativeEvent: { layout: { height: 280 } } });
		mockContentSizes['checkout-keypad-pane'](0, 480);
		mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 604 } } });
	});
	expect(screen.getByTestId('checkout-keypad').className).not.toContain('min-h-0');
	// head 371 + 24 + 256 = 651 > 604
	act(() => mockContentSizes['checkout-keypad-pane'](0, 651));
	expect(screen.getByTestId('checkout-keypad').className).toContain('min-h-0');
	const style = mockContentStyles['checkout-keypad-pane'] as Record<string, unknown>;
	expect(style.minHeight).toBe(604);
});

// Fractional widths plus a gap must not wrap five methods into four columns.
it.each([
	[false, 5],
	[true, 2],
] as const)('keeps fixed method rows and pads the last row (phone=%s)', (phone, columns) => {
	const flow = makeFlow(7);
	flow.tiles = flow.tiles.map((tile, index) => ({
		...tile,
		method: { ...tile.method, id: `method-${index}` },
	}));
	const { rerender } = render(
		<DeviceScope phone={phone}>
			<TenderPane flow={flow} format={String} />
		</DeviceScope>
	);
	for (const saving of [true, false]) {
		rerender(
			<DeviceScope phone={phone}>
				<TenderPane flow={{ ...flow, saveState: saving ? flow.saveState : null }} format={String} />
			</DeviceScope>
		);
		// Saving or not, the method row is the same pills: the save settling moves nothing.
		const tiles = screen.getAllByTestId(/^checkout-method-method-/);
		expect(screen.getByTestId('checkout-commit').textContent === 'Saving order…').toBe(saving);
		expect(screen.getByTestId('checkout-commit').hasAttribute('data-loading')).toBe(saving);
		// Each tile sits in its grid cell (`TileGrid`); the row holds the cells.
		const rows = [...new Set(tiles.map((tile) => tile.parentElement!.parentElement!))];
		expect(rows).toHaveLength(phone ? 4 : 2);
		for (const row of rows) {
			expect(row.className).toContain('flex-row gap-2');
			expect(row.className).not.toContain('flex-wrap');
			expect(row.children).toHaveLength(columns);
			for (const cell of Array.from(row.children)) {
				expect(cell.className).toContain('flex-1');
				expect(cell.className).toContain('min-w-0');
			}
		}
		expect(tiles.map((tile) => tile.textContent?.includes('Cash'))).toEqual(Array(7).fill(true));
		const lastRow = rows.at(-1)!;
		expect(Array.from(lastRow.children).filter((cell) => cell.children.length === 0)).toHaveLength(
			phone ? 1 : 3
		);
	}
	rerender(
		<DeviceScope phone={phone}>
			<TenderPane flow={makeFlow(0)} format={String} />
		</DeviceScope>
	);
	const skeletons = screen.getAllByTestId('checkout-tile-skeleton');
	expect(skeletons).toHaveLength(4);
	const rows = [...new Set(skeletons.map((tile) => tile.parentElement!.parentElement!))];
	expect(rows).toHaveLength(phone ? 2 : 1);
	for (const row of rows) {
		expect(row.className).toContain('flex-row gap-2');
		expect(row.children).toHaveLength(columns);
	}
});

describe('declared UI (contract 1.2)', () => {
	const invoice: PaymentMethodDescriptor = {
		...method,
		id: 'wcpos_email_invoice',
		title: 'Email Invoice',
		kind: 'other',
		capture: { mode: 'gateway', provider: null, hardware: null, webview_available: true },
		capabilities: {
			...method.capabilities,
			amount: { partial: false },
			change: false,
			offline: 'none',
		},
		fields: {
			schema: 1,
			verb: { kind: 'send', label: 'Send invoice' },
			components: [
				{ component: 'note', text: 'An email will be sent.' },
				{
					component: 'field',
					id: 'woocommerce_pos_invoice_email_address',
					input: 'email',
					label: 'Email address',
					required: true,
					default: '',
					prefill: 'order.billing.email',
				},
				{
					component: 'checkbox',
					id: 'woocommerce_pos_save_billing_email',
					label: 'Save email to billing address',
					default: false,
					prefill: null,
				},
				{ component: 'hologram', id: 'future' },
			],
		},
	};
	function invoiceFlow(overrides: Partial<TenderFlow> = {}): TenderFlow {
		return withFigures({
			...makeFlow(),
			saveState: null,
			method: invoice,
			tiles: [
				{
					method: invoice,
					disabled: false,
					reason: null,
					worksOffline: false,
					settlesLater: false,
				},
			],
			state: { ...initialTenderState, view: 'amount', methodId: invoice.id, entryMinor: 9295 },
			fieldValues: {
				woocommerce_pos_invoice_email_address: 'buyer@example.com',
				woocommerce_pos_save_billing_email: false,
			},
			...overrides,
		});
	}
	it('draws the components in declaration order with the verb on the commit, keypad read-only', () => {
		const flow = invoiceFlow();
		render(<TenderPane flow={flow} format={String} />);
		const fields = screen.getByTestId('checkout-fields');
		expect(fields.textContent).toContain('An email will be sent.');
		const email = screen.getByTestId(
			'checkout-field-woocommerce_pos_invoice_email_address'
		) as HTMLInputElement;
		const save = screen.getByTestId(
			'checkout-field-woocommerce_pos_save_billing_email'
		) as HTMLInputElement;
		expect(email.value).toBe('buyer@example.com');
		expect(save.checked).toBe(false);
		expect(screen.queryByText('future')).toBeNull();
		expect(screen.getByTestId('checkout-commit').textContent).toBe('Send invoice · 9295');
		expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
		expect(screen.getByTestId('checkout-keypad-key-5').hasAttribute('disabled')).toBe(true);
		expect(screen.queryByTestId('checkout-quick-balance')).toBeNull();
		fireEvent.change(screen.getByTestId('checkout-field-woocommerce_pos_invoice_email_address'), {
			target: { value: 'x@y.z' },
		});
		expect(flow.commands.setFieldValues).toHaveBeenCalledWith(
			{ woocommerce_pos_invoice_email_address: 'x@y.z', woocommerce_pos_save_billing_email: false },
			'woocommerce_pos_invoice_email_address'
		);
		fireEvent.click(screen.getByTestId('checkout-commit'));
		expect(flow.commands.takeTender).toHaveBeenCalled();
	});
	it('an amount typed over the balance on another pill is not an overpayment here', () => {
		render(
			<TenderPane
				flow={invoiceFlow({
					state: {
						...initialTenderState,
						view: 'amount',
						methodId: invoice.id,
						entryMinor: 10000,
						entryDirty: true,
					},
				})}
				format={String}
			/>
		);
		expect(screen.getByTestId('checkout-entry').textContent).toBe('9295');
		expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('');
		expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	});
	it('holds Send until the required component is filled, naming it', () => {
		render(
			<TenderPane
				flow={invoiceFlow({ fieldValues: { woocommerce_pos_invoice_email_address: '' } })}
				format={String}
			/>
		);
		expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('Enter Email address');
		expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	});
	it('renders a refusal under its component and the form line above the commit', () => {
		render(
			<TenderPane
				flow={invoiceFlow({
					fieldErrors: {
						woocommerce_pos_invoice_email_address: 'Enter a valid email.',
						_form: 'Mail server unreachable.',
					},
				})}
				format={String}
			/>
		);
		expect(
			screen.getByTestId('checkout-field-woocommerce_pos_invoice_email_address-error').textContent
		).toBe('Enter a valid email.');
		expect(screen.getByTestId('checkout-form-error').textContent).toBe('Mail server unreachable.');
		expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	});
	it('a sent order shows where the invoice went and offers to cancel it', () => {
		const flow = invoiceFlow({
			invoiceSent: {
				method_id: 'wcpos_email_invoice',
				destination: 'buyer@example.com',
				attempt_id: 'attempt-0',
				sent_at_gmt: '2026-10-08T10:35:00.000Z',
				cashier_id: 7,
			},
		});
		render(<TenderPane flow={flow} format={String} />);
		expect(screen.getByTestId('checkout-invoice-sent').textContent).toContain(
			'Invoice sent to buyer@example.com on Oct 8, 10:35 PM'
		);
		fireEvent.click(screen.getByTestId('checkout-cancel-invoice'));
		expect(flow.commands.cancelInvoice).toHaveBeenCalled();
	});
	// R11: while a command holds the gate, every control that could fire another is inert; Try
	// again is not disabled by busy, because the flow refuses it itself.
	it('busy disables Commit, the method tile and Cancel invoice; Try again still presses', () => {
		const flow = invoiceFlow({
			busy: true,
			invoiceSent: {
				method_id: 'wcpos_email_invoice',
				destination: 'buyer@example.com',
				attempt_id: 'attempt-0',
				sent_at_gmt: '2026-10-08T10:35:00.000Z',
				cashier_id: 7,
			},
		});
		render(<TenderPane flow={flow} format={String} />);
		expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
		expect(screen.getByTestId('checkout-method-wcpos_email_invoice').hasAttribute('disabled')).toBe(
			true
		);
		expect(screen.getByTestId('checkout-cancel-invoice').hasAttribute('disabled')).toBe(true);
		render(<UnansweredGate flow={{ ...flow, unansweredCommand: true }} />);
		fireEvent.click(screen.getByTestId('checkout-unanswered-retry'));
		expect(flow.commands.retryCommand).toHaveBeenCalledTimes(1);
	});
	// C5-S1: a button spins only for its own command; every one is still disabled on busy.
	const bothLines = (running: TenderFlow['running']) =>
		invoiceFlow({
			busy: true,
			running,
			invoiceSent: {
				method_id: 'wcpos_email_invoice',
				destination: 'buyer@example.com',
				attempt_id: 'attempt-0',
				sent_at_gmt: '2026-10-08T10:35:00.000Z',
				cashier_id: 7,
			},
			unansweredAttempt: {
				id: 'attempt-9',
				methodId: 'wcpos_email_invoice',
				cashierId: 7,
				sentAtGmt: '2026-10-08T10:35:00.000Z',
				awaiting: null,
				flagged: false,
				title: 'Email Invoice',
			},
		});
	const spinners = [
		'checkout-commit',
		'checkout-cancel-invoice',
		'checkout-clear-attempt',
		'checkout-unanswered-retry',
	];
	const renderBoth = (flow: TenderFlow) => {
		render(<TenderPane flow={flow} format={String} />);
		render(<UnansweredGate flow={{ ...flow, unansweredCommand: true }} />);
	};
	it.each([
		['takeTender', 'checkout-commit'],
		['cancelInvoice', 'checkout-cancel-invoice'],
		['clearAttempt', 'checkout-clear-attempt'],
		['retryCommand', 'checkout-unanswered-retry'],
	] as const)('%s spins only %s', (running, spinner) => {
		renderBoth(bothLines(running));
		for (const testID of spinners) {
			expect(screen.getByTestId(testID).hasAttribute('data-loading')).toBe(testID === spinner);
		}
		for (const testID of spinners.slice(0, 3)) {
			expect(screen.getByTestId(testID).hasAttribute('disabled')).toBe(true);
		}
	});
	it('a confirm is open: busy, and no button spins behind it', () => {
		renderBoth(bothLines(null));
		for (const testID of spinners) {
			expect(screen.getByTestId(testID).hasAttribute('data-loading')).toBe(false);
		}
		expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	});
	describe('an unanswered gateway attempt', () => {
		const stranded = {
			id: 'attempt-9',
			methodId: 'wcpos_email_invoice',
			cashierId: 7,
			sentAtGmt: '2026-10-08T10:35:00.000Z',
			awaiting: null,
			flagged: false,
			title: 'Email Invoice',
		};
		const check =
			"Check the provider's dashboard before taking payment again; the store keeps checking and records it if the money was taken.";
		const line = () => screen.queryByTestId('checkout-attempt-unanswered');
		const sentence = () => line()?.querySelector('span')?.textContent;
		it('names the method and the time, then what to check; never that it failed', () => {
			render(<TenderPane flow={invoiceFlow({ unansweredAttempt: stranded })} format={String} />);
			expect(sentence()).toBe(
				`Your Email Invoice payment sent at Oct 8, 10:35 PM has no answer from the provider yet. ${check}`
			);
			expect(sentence()).not.toMatch(/fail/i);
		});
		it.each([
			['no descriptor for its method', { ...stranded, title: null }],
			['no send time', { ...stranded, sentAtGmt: null }],
		])('with %s says the unknown copy', (_, unansweredAttempt) => {
			render(<TenderPane flow={invoiceFlow({ unansweredAttempt })} format={String} />);
			expect(sentence()).toBe(
				`An earlier payment attempt on this order has no answer from the provider yet. ${check}`
			);
		});
		it('shows on a covered sale (balance 0, total above 0)', () => {
			const flow = invoiceFlow({ unansweredAttempt: stranded, balanceMinor: 0, paidMinor: 9295 });
			render(<TenderPane flow={flow} format={String} />);
			expect(screen.getByTestId('checkout-keypad')).not.toBeNull();
			expect(line()).not.toBeNull();
		});
		it('Clear attempt is a quiet destructive button that asks the flow', () => {
			const flow = invoiceFlow({ unansweredAttempt: stranded });
			render(<TenderPane flow={flow} format={String} />);
			const clear = screen.getByTestId('checkout-clear-attempt');
			expect(clear.textContent).toBe('Clear attempt');
			expect(clear.dataset.variant).toBe('outline-destructive');
			fireEvent.click(clear);
			expect(flow.commands.clearAttempt).toHaveBeenCalledTimes(1);
		});
		it.each([
			['offline', { online: false }],
			['busy', { busy: true }],
		])('Clear attempt is disabled while %s', (_, overrides) => {
			render(
				<TenderPane
					flow={invoiceFlow({ unansweredAttempt: stranded, ...overrides })}
					format={String}
				/>
			);
			expect(screen.getByTestId('checkout-clear-attempt').hasAttribute('disabled')).toBe(true);
		});
	});
	it('lists an unavailable gateway with the split reason', () => {
		const flow = invoiceFlow({
			method: null,
			state: initialTenderState,
			tiles: [
				{ method, disabled: false, reason: null, worksOffline: true, settlesLater: false },
				{
					method: invoice,
					disabled: true,
					reason: 'not_with_split',
					worksOffline: false,
					settlesLater: false,
				},
			],
		});
		render(<TenderPane flow={flow} format={String} />);
		fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
		expect(screen.getByTestId('checkout-unavailable-wcpos_email_invoice').textContent).toContain(
			'Takes the whole order, so not once a payment has been taken'
		);
	});
});

// ADR 0040 Decided 1 rule 1: the tile taken offline says it is sent later, and the risk.
it('a settlesLater tile says Sent when back online and Store may refuse; a plain manual tile says nothing', () => {
	const flow = makeFlow(2);
	flow.tiles[0] = { ...flow.tiles[0], settlesLater: true };
	flow.tiles[1] = { ...flow.tiles[1], method: { ...method, id: 'other' } };
	render(<TenderPane flow={flow} format={String} compact />);
	expect(screen.getByTestId('checkout-method-sent-later-pos_cash').textContent).toBe(
		'Sent when back onlineStore may refuse'
	);
	expect(screen.queryByTestId('checkout-method-sent-later-other')).toBeNull();
});

describe('offline with no method that can take the sale', () => {
	const offlineTile = (id: string): TenderFlow['tiles'][number] => ({
		method: { ...method, id, title: id },
		disabled: true,
		reason: 'offline',
		worksOffline: false,
		settlesLater: false,
	});
	const choosable = {
		method,
		disabled: false,
		reason: null,
		worksOffline: true,
		settlesLater: true,
	};
	const offlineFlow = (overrides: Partial<TenderFlow> = {}): TenderFlow =>
		withFigures({
			...makeFlow(),
			saveState: null,
			online: false,
			method: null,
			tiles: [offlineTile('pos_cash'), offlineTile('other')],
			...overrides,
		});
	const pane = (flow: TenderFlow, onLeave = jest.fn()) => (
		<TenderPane flow={flow} format={String} onLeave={onLeave} />
	);

	it('says the sale is kept and offers the way out when no method can take it offline', () => {
		const onLeave = jest.fn();
		render(pane(offlineFlow(), onLeave));
		const notice = screen.getByTestId('checkout-offline');
		expect(notice.textContent).toContain('No connection');
		expect(notice.textContent).toContain(
			'Taking a payment needs a connection. The sale is saved in your open orders.'
		);
		expect(screen.queryByTestId('checkout-commit')).toBeNull();
		fireEvent.click(screen.getByTestId('checkout-offline-leave'));
		expect(onLeave).toHaveBeenCalledTimes(1);
	});

	it('keeps the keypad when a method can still record offline', () => {
		render(pane(offlineFlow({ tiles: [offlineTile('other'), choosable] })));
		expect(screen.getByTestId('checkout-commit')).toBeTruthy();
		expect(screen.queryByTestId('checkout-offline-leave')).toBeNull();
	});

	it('keeps the keypad while money is held on the order', () => {
		render(pane(offlineFlow({ hasLiveLeg: true })));
		expect(screen.getByTestId('checkout-commit')).toBeTruthy();
		expect(screen.queryByTestId('checkout-offline-leave')).toBeNull();
	});

	it('is not the offline state when nothing is disabled for the connection', () => {
		const noDriver = (id: string) => ({ ...offlineTile(id), reason: 'no_driver' as const });
		render(pane(offlineFlow({ online: true, tiles: [noDriver('pos_cash'), noDriver('other')] })));
		expect(screen.queryByTestId('checkout-offline-leave')).toBeNull();
	});

	it('counts a tile disabled for another reason as blocked too', () => {
		const noDriver = { ...offlineTile('other'), reason: 'no_driver' as const };
		render(pane(offlineFlow({ tiles: [offlineTile('pos_cash'), noDriver] })));
		expect(screen.getByTestId('checkout-offline-leave')).toBeTruthy();
	});

	it('returns to the keypad when the connection comes back', () => {
		const flow = offlineFlow();
		const { rerender } = render(pane(flow));
		expect(screen.getByTestId('checkout-offline-leave')).toBeTruthy();
		rerender(pane({ ...flow, tiles: [offlineTile('other'), choosable] }));
		expect(screen.getByTestId('checkout-commit')).toBeTruthy();
		expect(screen.queryByTestId('checkout-offline-leave')).toBeNull();
	});

	describe('leaves a live terminal leg, a refusal and a save in flight on their own panes', () => {
		it.each<[string, Partial<TenderFlow>]>([
			['a live terminal leg', { terminalLeg: {} as TenderFlow['terminalLeg'] }],
			[
				'a refusal',
				{
					saveState: {
						kind: 'rejected',
						status: 400,
						reason: 'rest_invalid_param',
						message: null,
						refused: null,
						parked: false,
					},
				},
			],
			['a save in flight', { saveState: { kind: 'saving' } }],
		])('%s', (_, overrides) => {
			render(pane(offlineFlow(overrides)));
			expect(screen.queryByTestId('checkout-offline-leave')).toBeNull();
		});
	});
});

describe('change due leads once tendered exceeds the amount due', () => {
	function changeFlow(over: Partial<TenderFlow> = {}): TenderFlow {
		return withFigures({
			...makeFlow(),
			saveState: null,
			totalMinor: 4500,
			balanceMinor: 4500,
			state: {
				...initialTenderState,
				view: 'amount',
				methodId: method.id,
				entryMinor: 5000,
				entryDirty: true,
			},
			...over,
		});
	}

	it('leads with the change once tendered exceeds the amount due', () => {
		render(<TenderPane flow={changeFlow()} format={String} />);
		const hint = screen.getByTestId('checkout-entry-hint');
		expect(hint.textContent).toBe('Change 500');
		expect(hint.className).toContain('text-amt');
		expect(hint.className).toContain(TONE.ok.text);
		const entry = screen.getByTestId('checkout-entry');
		expect(entry.textContent).toBe('5000');
		expect(entry.className).not.toContain('text-amt');
		expect(screen.getByTestId('checkout-tendered-line').textContent).toBe('Tendered 5000');
	});

	it('keeps the tendered amount as the figure up to the amount due', () => {
		const base = changeFlow();
		render(
			<TenderPane
				flow={withFigures({ ...base, state: { ...base.state, entryMinor: 4500 } })}
				format={String}
			/>
		);
		expect(screen.getByTestId('checkout-entry').className).toContain('text-amt');
		expect(screen.getByTestId('checkout-entry-hint').className).not.toContain('text-amt');
		expect(screen.queryByTestId('checkout-tendered-line')).toBeNull();
	});

	it('names the total under the change on a part-paid order', () => {
		render(<TenderPane flow={changeFlow({ totalMinor: 9000 })} format={String} />);
		expect(screen.getByTestId('checkout-tendered-line').textContent).toBe(
			'Tendered 5000 · Total 9000'
		);
	});
});
