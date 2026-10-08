/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '@wcpos/components/lib/device';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { method as deviceMethod } from '../payments/device/fixtures.test-utils';
import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { registerDriver } from '../../../../../services/payment-drivers/registry';
import { initialTenderState, tenderReducer } from './tender-state';
import { TenderPane } from './tender-pane';
import { LedgerLines } from './ledger-pane';

import type { TenderFlow } from './use-tender-flow';

const mockPush = jest.fn();
const mockBootstrap = jest.fn(async () => ({ token: 'reader-token', method_id: 'device' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		onPress,
		variant,
		className,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		onPress?: () => void;
		variant?: string;
		className?: string;
	}) => (
		<button
			className={className}
			data-testid={testID}
			data-variant={variant}
			disabled={disabled}
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
jest.mock('../../../hooks/use-date-format', () => ({ useDateFormat: () => 'Oct 8, 10:35 PM' }));
// The declared-fields helpers draw host controls; their native deps stay out of jsdom.
jest.mock('@wcpos/components/checkbox', () => ({
	Checkbox: ({ testID, checked, onCheckedChange, disabled }: any) => (
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
	Input: ({ testID, value, onChangeText, editable }: any) => (
		<input
			data-testid={testID}
			value={value ?? ''}
			disabled={editable === false}
			onChange={(event) => onChangeText?.(event.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/select', () => ({
	OptionSelect: ({ options, value, onChange, placeholder }: any) => (
		<select value={value ?? ''} onChange={(event) => onChange?.(event.target.value)}>
			<option value="">{placeholder}</option>
			{options.map((option: any) => (
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
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
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
	return {
		bootstrapReader: mockBootstrap,
		rememberedReaderId: null,
		rememberReader: jest.fn(async () => {}),
		state: initialTenderState,
		dispatch: jest.fn(),
		dp: 2,
		totalMinor: 9295,
		paidMinor: 0,
		balanceMinor: 9295,
		thisPaymentMinor: 9295,
		afterThisPaymentMinor: 0,
		plan: null,
		planLegs: [],
		planLabel: null,
		planMore: false,
		lines: [],
		linesPaidBy: {},
		rows: [],
		liveRows: [],
		hasLiveLeg: false,
		terminalLeg: null,
		hasLiveTerminalLeg: false,
		readers: [],
		lockToDefault: false,
		pickReader: jest.fn(),
		cancelTerminalLeg: jest.fn(),
		releaseTerminalLeg: jest.fn(),
		retryTerminalCapture: jest.fn(),
		dismissTerminalLeg: jest.fn(),
		retryTerminalLeg: jest.fn(),
		online: true,
		tiles: Array.from({ length: count }, () => ({
			method,
			disabled: false,
			reason: null,
			worksOffline: true,
		})),
		legacyMethods: [],
		methodsLoaded: true,
		unsupportedSchema: false,
		method,
		entryAppliedMinor: 0,
		entryChangeMinor: 0,
		quickAmountsMinor: [],
		busy: false,
		saveState: { kind: 'saving' },
		pickMethod: jest.fn(),
		takeTender: jest.fn(),
		cancelPayment: jest.fn(),
		fieldValues: {},
		setFieldValues: jest.fn(),
		fieldErrors: {},
		invoiceSent: null,
		cancelInvoice: jest.fn(),
	};
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
	const flow = makeFlow(2);
	flow.tiles[1] = {
		...flow.tiles[1],
		method: { ...method, id: 'other' },
		disabled: true,
		reason: 'offline',
	};
	flow.plan = { kind: 'even', ways: 2, from: 0 };
	flow.planLegs = [
		{ state: 'now', minor: 4648 },
		{ state: 'rest', minor: 4647 },
	];
	flow.planMore = true;
	render(<TenderPane flow={flow} format={String} compact />);
	for (const id of [
		'checkout-plan-pick-items',
		'checkout-plan-change',
		'checkout-unavailable-toggle',
	])
		expect(screen.getByTestId(id).hasAttribute('disabled')).toBe(true);
	expect(flow.dispatch).not.toHaveBeenCalled();
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
				saveState: { kind: 'rejected', status: 400, reason: 'rest_invalid_param', message: null },
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
			},
		],
	};
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-method-pos_cash').getAttribute('data-variant')).toBe(
		'outline'
	);
	fireEvent.click(screen.getByTestId('checkout-method-pos_cash'));
	expect(flow.pickMethod).toHaveBeenCalledWith('pos_cash');
	expect(flow.takeTender).not.toHaveBeenCalled();
	expect(screen.queryByTestId('checkout-method-terminal')).toBeNull();
	expect(screen.queryByTestId('checkout-unavailable-terminal')).toBeNull();
	fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
	expect(screen.getByTestId('checkout-unavailable-terminal').textContent).toContain(
		'Needs a connection'
	);
	fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
	expect(screen.queryByTestId('checkout-unavailable-terminal')).toBeNull();
});

it('keeps an offline queue-capable device method selectable', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		tiles: [
			{
				method: deviceMethod,
				disabled: true,
				reason: 'offline',
				worksOffline: false,
			},
		],
	};
	render(<TenderPane flow={flow} format={String} />);
	fireEvent.click(screen.getByTestId('checkout-method-device'));
	expect(flow.pickMethod).toHaveBeenCalledWith('device');
	expect(screen.queryByTestId('checkout-unavailable-toggle')).toBeNull();
});

it.each([
	[9295, 9295, 9295, false, 'Take 9295 in Cash'],
	[2000, 2000, 9295, false, 'Take 2000 in Cash · 7295 left'],
	[10000, 9295, 9295, true, 'Take 9295 in Cash'],
	[2000, 2000, 2000, false, 'Take 2000 in Cash · pays it off'],
])(
	'labels the amount and commit for entry %s, applied %s, balance %s',
	(entry, applied, balance, change, label) => {
		const flow = {
			...makeFlow(),
			saveState: null,
			balanceMinor: balance,
			thisPaymentMinor: balance,
			entryAppliedMinor: applied,
			entryChangeMinor: change ? entry - applied : 0,
			state: {
				...initialTenderState,
				view: 'amount' as const,
				methodId: method.id,
				entryMinor: entry,
			},
		};
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
		expect(flow.takeTender).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByTestId('checkout-quick-exact'));
		expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: balance });
	}
);

it('blocks no-change over-tender and restores full balance from a partial entry', () => {
	const card = {
		...method,
		title: 'Card',
		capabilities: { ...method.capabilities, change: false },
	};
	const flow = {
		...makeFlow(),
		saveState: null,
		method: card,
		thisPaymentMinor: 9295,
		entryAppliedMinor: 9295,
		state: { ...initialTenderState, methodId: method.id, entryMinor: 10000 },
	};
	const { rerender } = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe(
		"Only 9295 is due — Card can't give change"
	);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(true);
	fireEvent.click(screen.getByTestId('checkout-commit'));
	expect(flow.takeTender).not.toHaveBeenCalled();
	rerender(
		<TenderPane
			flow={{
				...flow,
				thisPaymentMinor: 9295,
				entryAppliedMinor: 2000,
				state: { ...flow.state, entryMinor: 2000 },
			}}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	fireEvent.click(screen.getByTestId('checkout-quick-balance'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'set-entry', minor: 9295 });
});

it('shows plan legs, labels, a short entry hint and numbered commit tail', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		plan: { kind: 'even', ways: 3, from: 0 },
		planLabel: 'Payment 2 of 3',
		planLegs: [
			{ minor: 100, state: 'done', title: 'Card' },
			{ minor: 450, state: 'now' },
			{ minor: 450, state: 'todo' },
		],
		thisPaymentMinor: 450,
		balanceMinor: 900,
		entryAppliedMinor: 200,
		state: { ...initialTenderState, view: 'amount', entryMinor: 200, entryDirty: true },
	};
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-label').textContent).toContain('Payment 2 of 3 · 900 left');
	expect(screen.getByTestId('checkout-plan-leg-0').textContent).toContain('Card 100');
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe(
		'Less than planned · 250 moves to the next payment'
	);
	expect(screen.getByTestId('checkout-commit').textContent).toContain(' · 2 of 3');
	fireEvent.click(screen.getByTestId('checkout-plan-change'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'open-split' });
});
it('offers next items after a group, and renders a paid line badge', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		plan: { kind: 'items', ways: 1, firstMinor: 100, lineIds: [1], from: 0 },
		planMore: true,
		planLabel: 'Rest of the order',
		planLegs: [
			{ minor: 100, state: 'done', title: 'Card' },
			{ minor: 500, state: 'now' },
		],
	};
	render(
		<>
			<TenderPane flow={flow} format={String} />
			<LedgerLines
				lines={[{ id: 1, name: 'Belt' }]}
				totalMinor={600}
				format={String}
				paidBy={{ 1: ['Card', 'SumUp'] }}
			/>
		</>
	);
	fireEvent.click(screen.getByTestId('checkout-plan-pick-items'));
	expect(flow.dispatch).toHaveBeenCalledWith({ type: 'set-split-tab', tab: 'item' });
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'open-split' });
	expect(screen.getByText('paid · Card + SumUp')).toBeTruthy();
});

it('keeps the keypad visible without a method and disables commit', () => {
	render(
		<TenderPane
			flow={{ ...makeFlow(), method: null, saveState: null, online: false }}
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
	const flow = {
		...makeFlow(),
		saveState: null,
		method: deviceMethod,
		tiles: [{ method: deviceMethod, disabled: false, reason: null, worksOffline: false }],
		deviceTransport: 'bluetooth' as const,
		pickTransport: jest.fn(),
		deviceReady: false,
		entryAppliedMinor: 1000,
	};
	const rendered = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-reader-status').textContent).toContain('No reader connected');
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
	expect(screen.getByTestId('checkout-reader-status').textContent).toBe('Simulated approve · 82%');
	expect(screen.queryByTestId('checkout-reader-settings-link')).toBeNull();
	expect(screen.getByTestId(`checkout-method-status-${deviceMethod.id}`).textContent).toContain(
		'82%'
	);
	rendered.rerender(<TenderPane flow={{ ...flow, deviceReady: true }} format={String} />);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
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
		const flow = {
			...makeFlow(),
			saveState: null,
			method: deviceMethod,
			rememberedReaderId: 'remembered',
			pickTransport: jest.fn(),
			bootstrapReader,
			deviceTransport: 'bluetooth' as const,
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
	const flow: TenderFlow = {
		...makeFlow(),
		plan: { kind: 'even', ways: 2, from: 0 },
		saveState: null,
		balanceMinor: 2000,
		thisPaymentMinor: 1000,
		entryAppliedMinor: 1500,
		method: { ...method, title: 'Card', capabilities: { ...method.capabilities, change: false } },
		state: {
			...initialTenderState,
			methodId: method.id,
			entryMinor: 1500,
		},
	};
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-commit').hasAttribute('disabled')).toBe(false);
	expect(screen.getByTestId('checkout-entry-hint').textContent).toBe('');
	expect(screen.getByTestId('checkout-quick-balance').textContent).toBe('Exact 1000');
});

it('keeps fixed plans numbered out of two, but stops numbering a completed item group', () => {
	const flow: TenderFlow = {
		...makeFlow(),
		saveState: null,
		balanceMinor: 1,
		thisPaymentMinor: 1,
		entryAppliedMinor: 1,
		plan: { kind: 'fixed', firstMinor: 1, title: null, from: 0 },
		planLegs: [{ minor: 1, state: 'now' }],
	};
	const { rerender } = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-commit').textContent).toContain(' · 1 of 2');
	rerender(
		<TenderPane
			flow={{
				...flow,
				plan: { kind: 'items', firstMinor: 100, lineIds: [1], ways: 1, from: 0 },
				planMore: false,
				planLegs: [
					{ minor: 100, state: 'done', title: 'Cash' },
					{ minor: 1, state: 'now' },
				],
			}}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-commit').textContent).toContain(' · pays it off');
});

it('preserves every keypad selector and dispatches the original key action', () => {
	const flow = { ...makeFlow(), saveState: null };
	render(<TenderPane flow={flow} format={String} />);
	for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace']) {
		expect(screen.getByTestId(`checkout-key-${key}`)).toBeTruthy();
	}
	fireEvent.click(screen.getByTestId('checkout-key-5'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'key', key: '5' });
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
jest.mock('react-native', () => {
	const native = jest.requireActual('react-native');
	function Box({
		children,
		testID,
		className,
		onLayout,
	}: React.PropsWithChildren<{
		testID?: string;
		className?: string;
		onLayout?: (typeof mockLayouts)[string];
	}>) {
		// The jsdom host has no layout engine; expose its committed layout callback to the test.
		React.useLayoutEffect(() => {
			if (testID && onLayout) mockLayouts[testID] = onLayout;
		}, [testID, onLayout]);
		return (
			<div data-testid={testID} className={className}>
				{children}
			</div>
		);
	}
	return { ...native, View: Box, ScrollView: Box };
});
it('shrinks the shared keypad under a short measured pane and restores tile fit', () => {
	render(<TenderPane flow={{ ...makeFlow(), saveState: null }} format={String} />);
	act(() => {
		mockLayouts['checkout-keypad']({ nativeEvent: { layout: { y: 200 } } });
		mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 400 } } });
	});
	expect(screen.getByTestId('checkout-keypad').className).toContain('min-h-0');
	act(() => mockLayouts['checkout-keypad-pane']({ nativeEvent: { layout: { height: 900 } } }));
	expect(screen.getByTestId('checkout-keypad').className).not.toContain('min-h-0');
});

// Fractional widths plus a gap must not wrap five methods into four columns.
it.each([
	[false, 5],
	[true, 3],
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
		const rows = [...new Set(tiles.map((tile) => tile.parentElement!))];
		expect(rows).toHaveLength(phone ? 3 : 2);
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
		expect(
			Array.from(lastRow.children).filter((cell) => !cell.hasAttribute('data-testid'))
		).toHaveLength(phone ? 2 : 3);
	}
	rerender(
		<DeviceScope phone={phone}>
			<TenderPane flow={makeFlow(0)} format={String} />
		</DeviceScope>
	);
	const skeletons = screen.getAllByTestId('checkout-tile-skeleton');
	expect(skeletons).toHaveLength(4);
	const rows = [...new Set(skeletons.map((tile) => tile.parentElement!))];
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
		return {
			...makeFlow(),
			saveState: null,
			method: invoice,
			tiles: [{ method: invoice, disabled: false, reason: null, worksOffline: false }],
			state: { ...initialTenderState, view: 'amount', methodId: invoice.id, entryMinor: 9295 },
			entryAppliedMinor: 9295,
			fieldValues: {
				woocommerce_pos_invoice_email_address: 'buyer@example.com',
				woocommerce_pos_save_billing_email: false,
			},
			...overrides,
		};
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
		expect(screen.getByTestId('checkout-key-5').hasAttribute('disabled')).toBe(true);
		expect(screen.queryByTestId('checkout-quick-balance')).toBeNull();
		fireEvent.change(screen.getByTestId('checkout-field-woocommerce_pos_invoice_email_address'), {
			target: { value: 'x@y.z' },
		});
		expect(flow.setFieldValues).toHaveBeenCalledWith(
			{ woocommerce_pos_invoice_email_address: 'x@y.z', woocommerce_pos_save_billing_email: false },
			'woocommerce_pos_invoice_email_address'
		);
		fireEvent.click(screen.getByTestId('checkout-commit'));
		expect(flow.takeTender).toHaveBeenCalled();
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
		expect(flow.cancelInvoice).toHaveBeenCalled();
	});
	it('lists an unavailable gateway with the split reason', () => {
		const flow = invoiceFlow({
			method: null,
			state: initialTenderState,
			tiles: [
				{ method, disabled: false, reason: null, worksOffline: true },
				{ method: invoice, disabled: true, reason: 'not_with_split', worksOffline: false },
			],
		});
		render(<TenderPane flow={flow} format={String} />);
		fireEvent.click(screen.getByTestId('checkout-unavailable-toggle'));
		expect(screen.getByTestId('checkout-unavailable-wcpos_email_invoice').textContent).toContain(
			'Takes the whole order, so not once a payment has been taken'
		);
	});
});
