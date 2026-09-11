/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { method as deviceMethod } from '../payments/device/fixtures.test-utils';
import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { registerDriver } from '../../../../../services/payment-drivers/registry';
import { initialTenderState } from './tender-state';
import { TenderPane } from './tender-pane';
import { ThisPaymentLine } from './ledger-pane';
import { ReaderConnection } from './reader-connection';

import type { DriverStatus } from '../../../../../services/payment-drivers/types';
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
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		onPress?: () => void;
		variant?: string;
	}) => (
		<button data-testid={testID} data-variant={variant} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: 'span',
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
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
jest.mock('@wcpos/components/hstack', () => ({ HStack: 'div' }));
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
		splitLegs: [],
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
	};
}
it.each([0, 1])(
	'shows inert known tiles or four fallback skeletons while saving (%s tiles)',
	(count) => {
		const flow = makeFlow(count);
		render(<TenderPane flow={flow} format={String} compact />);
		if (count) {
			expect(screen.getByTestId('checkout-tile-pos_cash').hasAttribute('disabled')).toBe(true);
			expect(screen.getByTestId('checkout-tile-saving').textContent).toBe('Saving order…');
			expect(screen.queryByTestId('checkout-tile-skeleton')).toBeNull();
		} else expect(screen.getAllByTestId('checkout-tile-skeleton')).toHaveLength(4);
		expect(screen.queryByTestId('checkout-keypad')).toBeNull();
		expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
	}
);

it('shows one slow notice after four seconds without settling the save', () => {
	jest.useFakeTimers();
	try {
		const flow = makeFlow();
		const { rerender } = render(<TenderPane flow={flow} format={String} />);
		act(() => jest.advanceTimersByTime(3999));
		expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
		act(() => jest.advanceTimersByTime(1));
		expect(screen.getAllByTestId('checkout-save-slow')).toHaveLength(1);
		expect(screen.getByTestId('checkout-tile-pos_cash').hasAttribute('disabled')).toBe(true);
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
it('renders tiles instead of skeletons when queued offline', () => {
	render(
		<TenderPane
			flow={{ ...makeFlow(), method: null, saveState: { kind: 'queued-offline', mutationId: 'm' } }}
			format={String}
		/>
	);
	expect(screen.queryByTestId('checkout-tile-skeleton')).toBeNull();
	expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
	expect(screen.getByTestId('checkout-tile-pos_cash')).toBeTruthy();
});

it('labels the keypad leg and takes the amount in the verbatim method title', () => {
	const flow = {
		...makeFlow(),
		saveState: null,
		entryAppliedMinor: 3100,
		state: {
			...initialTenderState,
			view: 'amount' as const,
			splitPlan: { ways: 3, shareMinor: 3100, taken: 1 },
		},
	};
	render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-keypad-leg').textContent).toBe(' · Payment 2 of 3');
	expect(screen.getByTestId('checkout-take-payment').textContent).toBe('Take 3100 in Cash');
});

it.each(['select', 'amount'] as const)('offers split choices from the %s view', (view) => {
	const flow = { ...makeFlow(), state: { ...initialTenderState, view, splitMenuOpen: true } };
	const { rerender } = render(<ThisPaymentLine flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-this-payment').textContent).toBe('9295');
	for (const [ways, shareMinor] of [
		[2, 4648],
		[3, 3098],
		[4, 2324],
	]) {
		fireEvent.click(screen.getByTestId(`checkout-split-${ways}`));
		expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'set-split-plan', ways, shareMinor });
	}
	fireEvent.click(screen.getByTestId('checkout-split-custom'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'arm-custom-amount' });
	expect(screen.queryByTestId('checkout-split-clear')).toBeNull();
	fireEvent.click(screen.getByTestId('checkout-split-close'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'close-split-menu' });
	fireEvent.click(screen.getByTestId('checkout-split-payment'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'close-split-menu' });
	rerender(
		<ThisPaymentLine
			flow={{ ...flow, state: { ...flow.state, splitMenuOpen: false } }}
			format={String}
		/>
	);
	fireEvent.click(screen.getByTestId('checkout-split-payment'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'open-split-menu' });
});
it('shows plan states, clears a split, and explains a custom entry remainder', () => {
	const flow = {
		...makeFlow(),
		splitLegs: [
			{ minor: 3000, state: 'done' as const },
			{ minor: 3098, state: 'now' as const },
			{ minor: 3197, state: 'todo' as const },
		],
		state: {
			...initialTenderState,
			splitMenuOpen: true,
			splitPlan: { ways: 3, shareMinor: 3098, taken: 1 },
		},
	};
	const { rerender } = render(<ThisPaymentLine flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-split-payment').textContent).toBe('Split 3 ways');
	expect(screen.getByText('Payment 2 of 3')).toBeTruthy();
	for (const [index, variant] of ['success', 'default', 'muted'].entries()) {
		expect(screen.getByTestId(`checkout-split-leg-${index}`).getAttribute('data-variant')).toBe(
			variant
		);
	}
	expect(screen.getByTestId('checkout-split-leg-0').textContent).toBe('3000 ✓');
	fireEvent.click(screen.getByTestId('checkout-split-clear'));
	expect(flow.dispatch).toHaveBeenLastCalledWith({ type: 'clear-split', balanceMinor: 9295 });
	const custom = {
		...flow,
		afterThisPaymentMinor: 8295,
		state: { ...initialTenderState, view: 'amount' as const, customAmount: true, entryMinor: 1000 },
	};
	rerender(<ThisPaymentLine flow={custom} format={String} />);
	expect(screen.getByTestId('checkout-split-payment').textContent).toBe('Custom amount');
	expect(screen.getByTestId('checkout-split-after').textContent).toBe(
		'After this payment: 8295 still to take'
	);
	for (const state of [
		{ ...custom.state, entryMinor: 0 },
		{ ...custom.state, view: 'select' as const },
	]) {
		rerender(<ThisPaymentLine flow={{ ...custom, state }} format={String} />);
		expect(screen.queryByTestId('checkout-split-after')).toBeNull();
	}
	for (const hidden of [
		{ ...flow, balanceMinor: 0 },
		{ ...flow, state: { ...flow.state, view: 'cancel' as const } },
	]) {
		rerender(<ThisPaymentLine flow={hidden} format={String} />);
		expect(screen.queryByTestId('checkout-this-payment')).toBeNull();
	}
});

it('explains the next step for a plan, a custom amount, and ordinary payment', () => {
	const flow = { ...makeFlow(), method: null, saveState: null, thisPaymentMinor: 3100 };
	const { rerender } = render(
		<TenderPane
			flow={{
				...flow,
				state: { ...initialTenderState, splitPlan: { ways: 3, shareMinor: 3100, taken: 1 } },
			}}
			format={String}
		/>
	);
	expect(screen.getByText('Choose how the customer pays payment 2 of 3, 3100.')).toBeTruthy();
	rerender(
		<TenderPane
			flow={{ ...flow, state: { ...initialTenderState, customAmount: true } }}
			format={String}
		/>
	);
	expect(
		screen.getByText('Choose the payment type, then type the amount on the keypad.')
	).toBeTruthy();
	rerender(<TenderPane flow={flow} format={String} />);
	expect(
		screen.getByText(
			'Choose how the customer is paying. Use Split to take it in parts, or type a smaller amount after choosing a type.'
		)
	).toBeTruthy();
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
it('device status, discovery, bootstrap and transport choice drive payment readiness', async () => {
	const driver = createSimulatedDriver();
	registerDriver(driver);
	const transportChanges = jest.fn();
	const flow = {
		...makeFlow(),
		saveState: null,
		method: deviceMethod,
		tiles: [{ method: deviceMethod, disabled: false, reason: null, worksOffline: false }],
		deviceTransport: 'bluetooth' as const,
		pickTransport: transportChanges,
		deviceReady: false,
		entryAppliedMinor: 1000,
	};
	const rendered = render(<TenderPane flow={flow} format={String} />);
	expect(screen.getByTestId('checkout-reader-status').textContent).toContain('No reader connected');
	expect(screen.getByTestId('checkout-take-payment').hasAttribute('disabled')).toBe(true);
	await act(async () => {
		fireEvent.click(screen.getByTestId('checkout-reader-connect'));
	});
	expect(screen.getByTestId('checkout-reader-list')).not.toBeNull();
	await act(async () => {
		fireEvent.click(screen.getByTestId('checkout-reader-option-sim-approve'));
		await new Promise((resolve) => setTimeout(resolve, 350));
	});
	expect(mockBootstrap).toHaveBeenCalledWith('bluetooth');
	expect(screen.getByTestId('checkout-reader-status').textContent).toContain('Simulated approve');
	rendered.rerender(<TenderPane flow={{ ...flow, deviceReady: true }} format={String} />);
	expect(screen.getByTestId('checkout-take-payment').hasAttribute('disabled')).toBe(false);
	fireEvent.click(screen.getByTestId('checkout-transport-tap_to_pay'));
	expect(transportChanges).toHaveBeenCalledWith('tap_to_pay');
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
		expect(screen.getByTestId('checkout-reader-connect').hasAttribute('disabled')).toBe(true);
		await act(async () => {
			rendered.rerender(<TenderPane flow={{ ...flow, online: false }} format={String} />);
		});
		expect(screen.getByTestId('checkout-reader-connect').hasAttribute('disabled')).toBe(false);
		expect(connect).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenLastCalledWith(reader, null);
		await act(async () => {
			resolve();
			await pending;
		});
		expect(connect).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('checkout-reader-connect').hasAttribute('disabled')).toBe(false);
		rendered.unmount();
	}
);

describe('reader dev controls', () => {
	const dev = __DEV__;
	afterEach(() => {
		Object.assign(globalThis, { __DEV__: dev });
	});
	function setup() {
		let status: DriverStatus = { connection: 'disconnected', reader: null };
		let listener: (status: DriverStatus) => void = () => {};
		let active = false;
		const run = jest.fn(async () => {
			active = !active;
		});
		const devControls = jest.fn(() =>
			status.connection === 'connected'
				? [{ id: 'offline', label: `Offline: ${active ? 'on' : 'off'}`, active, run }]
				: []
		);
		registerDriver({
			...createSimulatedDriver(),
			devControls,
			status$: {
				get: () => status,
				subscribe: (next) => {
					listener = next;
					return () => {
						listener = () => {};
					};
				},
			},
		});
		const rendered = render(
			<ReaderConnection
				method={deviceMethod}
				remembered={null}
				remember={jest.fn()}
				bootstrap={mockBootstrap}
				transport="bluetooth"
				pickTransport={jest.fn()}
				online
				disabled={false}
			/>
		);
		const publish = (connection: DriverStatus['connection']) =>
			act(() => {
				status = { connection, reader: null };
				listener(status);
			});
		return { ...rendered, publish, run, devControls };
	}
	it('refreshes controls on status changes and after running, including active styling', async () => {
		const { publish, run } = setup();
		expect(screen.queryByTestId('checkout-dev-control-offline')).toBeNull();
		publish('connected');
		expect(screen.getByTestId('checkout-dev-control-offline').getAttribute('data-variant')).toBe(
			'secondary'
		);
		await act(async () => {
			fireEvent.click(screen.getByTestId('checkout-dev-control-offline'));
		});
		expect(run).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('checkout-dev-control-offline').textContent).toBe('Offline: on');
		expect(screen.getByTestId('checkout-dev-control-offline').getAttribute('data-variant')).toBe(
			'default'
		);
		publish('disconnected');
		expect(screen.queryByTestId('checkout-dev-control-offline')).toBeNull();
	});
	it('shows a rejected control message on the error line and refreshes the controls', async () => {
		const { publish, run, devControls, container } = setup();
		publish('connected');
		run.mockRejectedValueOnce(new Error('Simulation unavailable'));
		devControls.mockClear();
		await act(async () => {
			fireEvent.click(screen.getByTestId('checkout-dev-control-offline'));
		});
		expect(container.textContent).toContain('Simulation unavailable');
		expect(devControls).toHaveBeenCalled();
		expect(screen.getByTestId('checkout-dev-control-offline').getAttribute('data-variant')).toBe(
			'secondary'
		);
	});
	it('never reads or renders controls outside dev builds, even after status changes', () => {
		Object.assign(globalThis, { __DEV__: false });
		const { publish, devControls } = setup();
		publish('connected');
		expect(devControls).not.toHaveBeenCalled();
		expect(screen.queryByTestId('checkout-dev-control-offline')).toBeNull();
	});
});
