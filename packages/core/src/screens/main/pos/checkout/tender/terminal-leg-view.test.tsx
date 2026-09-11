/** @jest-environment jsdom */
import * as React from 'react';
import { AccessibilityInfo } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import { TerminalLegView } from './terminal-leg-view';
import { method as deviceMethod } from '../payments/device/fixtures.test-utils';
import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { registerDriver } from '../../../../../services/payment-drivers/registry';

import type { TerminalLegState } from '../../../../../services/terminal-payments';
import type { TenderFlow } from './use-tender-flow';
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
// Uniwind's className transform is not installed in Jest's RN-web adapter.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({
		children,
		testID,
		className,
		'aria-selected': selected,
	}: {
		children?: React.ReactNode;
		testID?: string;
		className?: string;
		'aria-selected'?: boolean;
	}) => (
		<div data-testid={testID} className={className} aria-selected={selected}>
			{children}
		</div>
	),
}));
jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'sm' }) }));
// The UI-thread animation runtime is unavailable in jsdom; retain the rendered View/styles.
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	useSharedValue: (value: number) => React.useRef({ value }).current,
	useAnimatedStyle: (style: () => object) => style(),
	withTiming: (value: number) => value,
	withRepeat: jest.fn((value: number) => value),
	cancelAnimation: jest.fn(),
	Easing: { linear: (value: number) => value },
}));
beforeEach(() => {
	jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
	jest.requireMock('react-native-reanimated').withRepeat.mockClear();
});
afterEach(() => jest.restoreAllMocks());
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		onPress,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button data-testid={testID}>{children}</button>
	),
	CollapsibleContent: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/utils/platform', () => ({ Platform: { isNative: false } }));
const row = {
	method_id: 'terminal',
	amount: '5.00',
	failure_reason: 'card_declined',
	provider_refs: { reader: 'reader' },
	events: [],
} as unknown as PaymentRow;
const base: TerminalLegState = {
	row,
	phase: 'polling',
	outcome: null,
	cancelRequested: false,
	releaseAvailable: false,
	unstable: false,
	consecutiveErrors: 0,
	deadlineAt: 0,
	deadlineHandled: false,
	capturing: false,
	captureFailed: false,
	error: null,
	clientEvents: [],
	reader: 'reader',
	orderNumber: '42',
};
const actions = ['cancel', 'capture-retry', 'release', 'retry', 'another'];
const cases: [Partial<TerminalLegState>, string, string[]][] = [
	[{ phase: 'creating' }, 'Starting the terminal…', ['cancel']],
	[{}, 'Waiting for the customer on the terminal', ['cancel']],
	[{ unstable: true }, 'Waiting for the customer on the terminal', ['cancel']],
	[{ capturing: true }, 'Capturing…', []],
	[
		{ captureFailed: true, error: { code: 'declined', message: 'Provider says no' } },
		'Authorised, not captured: Provider says no',
		['capture-retry', 'cancel'],
	],
	[{ phase: 'cancelling' }, 'Cancelling…', ['cancel']],
	[{ cancelRequested: true }, 'Cancelling — waiting for the terminal to confirm', []],
	[
		{ cancelRequested: true, releaseAvailable: true },
		'Cancelling — waiting for the terminal to confirm',
		['release'],
	],
	[{ phase: 'final', outcome: 'captured' }, '', []],
	[{ phase: 'final', outcome: 'failed' }, 'Payment failed: Card declined', ['retry', 'another']],
	[
		{
			phase: 'final',
			outcome: 'failed',
			error: { code: 'provider_declined', message: 'Bank says no' },
		},
		'Payment failed: Bank says no',
		['retry', 'another'],
	],
	[{ phase: 'final', outcome: 'voided' }, 'Payment cancelled', ['retry', 'another']],
	[
		{ phase: 'final', outcome: 'voided', deadlineHandled: true },
		'Timed out — payment cancelled',
		['retry', 'another'],
	],
	[{ phase: 'final', outcome: 'released' }, 'Payment released', ['retry', 'another']],
	[{ phase: 'idle' }, 'Waiting for the customer on the terminal', ['cancel']],
];
function renderLeg(changes: Partial<TerminalLegState> = {}, extra: Partial<TenderFlow> = {}) {
	const flow = {
		terminalLeg: { ...base, ...changes },
		dp: 2,
		lines: [],
		tiles: [],
		cancelTerminalLeg: jest.fn(),
		releaseTerminalLeg: jest.fn(),
		retryTerminalCapture: jest.fn(),
		retryTerminalLeg: jest.fn(),
		dismissTerminalLeg: jest.fn(),
		...extra,
	} as unknown as TenderFlow;
	const view = render(
		<TerminalLegView flow={flow} format={(minor) => `$${(minor / 100).toFixed(2)}`} />
	);
	return Object.assign(flow, {
		update: (changes: Partial<TerminalLegState>) => {
			flow.terminalLeg = { ...flow.terminalLeg!, ...changes } as TerminalLegState;
			view.rerender(<TerminalLegView flow={flow} format={String} />);
		},
	});
}
it.each(cases)('renders the terminal state %j', (changes, status, present) => {
	renderLeg(changes);
	expect(screen.queryByTestId('checkout-terminal-status')?.textContent ?? '').toBe(status);
	for (const action of actions) {
		const button = screen.queryByTestId(`checkout-terminal-${action}`);
		expect(Boolean(button)).toBe(present.includes(action));
		if (button) expect((button as HTMLButtonElement).disabled).toBe(changes.phase === 'cancelling');
	}
	if (changes.unstable)
		expect(screen.getByTestId('checkout-terminal-leg').textContent).toContain(
			'Connection unstable — still waiting'
		);
});
it('merges logs oldest first and copies the displayed lines', async () => {
	const writeText = jest.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
	const flow = renderLeg({
		row: { ...row, events: [{ t: '2026-09-08T12:00:02Z', level: 'error', message: 'Last' }] },
		clientEvents: [{ t: '2026-09-08T12:00:01Z', level: 'warning', message: 'First' }],
	});
	const log = screen.getByTestId('checkout-terminal-log');
	expect(log.textContent?.indexOf('First')).toBeLessThan(log.textContent!.indexOf('Last'));
	fireEvent.click(screen.getByTestId('checkout-terminal-log-copy'));
	expect(writeText).toHaveBeenCalledWith(
		expect.stringMatching(/\d{2}:\d{2}:01 · First\n\d{2}:\d{2}:02 · Last/)
	);
	fireEvent.click(screen.getByTestId('checkout-terminal-cancel'));
	expect(flow.cancelTerminalLeg).toHaveBeenCalledTimes(1);
});

it.each([
	['collecting', false, 'Present card on the reader'],
	['confirming', false, 'Confirming…'],
	['collecting', true, 'Cancel on the reader'],
] as const)('renders device %s cancel=%s', (phase, cancelRequested, text) => {
	const leg: TerminalLegState = {
		...base,
		row: { ...row, capture_mode: 'device' },
		phase,
		cancelRequested,
		cancelOnDevice: true,
		resumed: false,
		failureReason: null,
	};
	render(
		<TerminalLegView
			flow={{ terminalLeg: leg, tiles: [], lines: [], dp: 2 } as unknown as TenderFlow}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-terminal-status').textContent).toBe(text);
});

// Wrong phase mapping must highlight a different dot, not merely change the status copy.
it.each([
	[{ phase: 'creating' }, 0],
	[{ phase: 'polling' }, 1],
	[{ phase: 'polling', capturing: true }, 2],
	[{ phase: 'polling', captureFailed: true }, 2],
	[{ phase: 'collecting', row: { ...row, capture_mode: 'device' } }, 1],
	[{ phase: 'confirming', row: { ...row, capture_mode: 'device' } }, 2],
	[{ phase: 'capturing', row: { ...row, capture_mode: 'device' } }, 2],
] as [Partial<TerminalLegState>, number][])('highlights the step for %j', (changes, current) => {
	renderLeg(changes);
	for (let index = 0; index < 4; index++) {
		const dot = screen.getByTestId(`checkout-terminal-step-${index}`);
		expect(dot.getAttribute('aria-selected')).toBe(String(index === current));
		expect(dot.className.includes('bg-success')).toBe(index < current);
	}
});

it.each([0, 1, 2])('keeps step %s when the terminal fails', (step) => {
	const flow = renderLeg({ phase: step === 0 ? 'creating' : 'polling', capturing: step === 2 });
	flow.update({ phase: 'final', outcome: 'failed', capturing: false });
	expect(screen.getByTestId(`checkout-terminal-step-${step}`).getAttribute('aria-selected')).toBe(
		'true'
	);
	expect(screen.getByTestId('checkout-terminal-status').textContent).toBe(
		'Payment failed: Card declined'
	);
	expect(screen.queryByTestId('checkout-terminal-ring')).toBeNull();
});

it('keeps Approved through cancellation and release', () => {
	const flow = renderLeg({ capturing: true });
	flow.update({ phase: 'cancelling', capturing: false });
	flow.update({ phase: 'polling', cancelRequested: true });
	flow.update({ phase: 'final', outcome: 'released' });
	expect(screen.getByTestId('checkout-terminal-step-2').getAttribute('aria-selected')).toBe('true');
});

it('renders a static ring when reduce motion is enabled', async () => {
	await act(async () => {
		renderLeg();
	});
	expect(screen.getByTestId('checkout-terminal-ring').style.transform).toBe('rotate(0deg)');
	expect(jest.requireMock('react-native-reanimated').withRepeat).not.toHaveBeenCalled();
});

it('starts the ring only after the motion preference resolves false', async () => {
	jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
	await act(async () => {
		renderLeg();
	});
	expect(jest.requireMock('react-native-reanimated').withRepeat).toHaveBeenCalledWith(360, -1);
});

const tile = (method: PaymentMethodDescriptor) => ({
	method,
	disabled: false,
	reason: null,
	worksOffline: false,
	settlesLater: false,
});
it.each(['online', 'offline'] as const)(
	'shows server connectivity only for an online reader (%s)',
	(status) => {
		const method: PaymentMethodDescriptor = {
			...deviceMethod,
			id: 'terminal',
			title: 'SumUp',
			capture: {
				...deviceMethod.capture,
				mode: 'server',
				hardware: {
					discovery: 'server',
					default_reader: 'reader',
					lock_to_default: false,
					readers: [{ id: 'reader', label: 'Counter 1', status, default: true }],
				},
			},
		};
		renderLeg({}, { tiles: [tile(method)] });
		const text = screen.getByTestId('checkout-terminal-leg').textContent;
		expect(text).toContain('SumUp · Counter 1');
		expect(text?.includes('Connected')).toBe(status === 'online');
	}
);

it('reads device connection and battery from the driver status stream', async () => {
	const driver = createSimulatedDriver();
	registerDriver(driver);
	await driver.connect!(
		{ id: 'reader', label: 'Counter 1', battery: 82, transport: 'bluetooth' },
		null
	);
	await act(async () => {
		renderLeg(
			{ row: { ...row, method_id: 'device', provider: driver.provider, capture_mode: 'device' } },
			{ tiles: [tile(deviceMethod)] }
		);
	});
	expect(screen.getByTestId('checkout-terminal-leg').textContent).toContain('Connected82%');
	await act(async () => {
		await driver.disconnect!();
	});
	expect(screen.getByTestId('checkout-terminal-leg').textContent).not.toContain('Connected');
	expect(screen.getByTestId('checkout-terminal-leg').textContent).not.toContain('82%');
});

it.each([
	[{ captureFailed: true }, 'capture-retry', 'retryTerminalCapture'],
	[{ cancelRequested: true, releaseAvailable: true }, 'release', 'releaseTerminalLeg'],
	[{ phase: 'final', outcome: 'failed' }, 'retry', 'retryTerminalLeg'],
	[{ phase: 'final', outcome: 'failed' }, 'another', 'dismissTerminalLeg'],
] as const)('keeps the %s action wired to %s', (changes, id, handler) => {
	const flow = renderLeg(changes);
	fireEvent.click(screen.getByTestId(`checkout-terminal-${id}`));
	expect(flow[handler]).toHaveBeenCalledTimes(1);
});

it('uses the flow order number, line count (not quantities), and plan label', () => {
	renderLeg(
		{},
		{
			plan: { kind: 'even', ways: 3, from: 0 },
			planLabel: 'Payment 2 of 3',
			lines: [
				{ id: 1, name: 'First', quantity: 4, totalMinor: 100 },
				{ id: 2, name: 'Second', quantity: 2, totalMinor: 200 },
			],
		}
	);
	expect(screen.getByTestId('checkout-terminal-leg').textContent).toContain(
		'Order #42 · 2 itemsPayment 2 of 3'
	);
});

it('shows just the default plan label when the order number is unavailable', () => {
	renderLeg({ orderNumber: '' });
	const text = screen.getByTestId('checkout-terminal-leg').textContent;
	expect(text).toContain('Payment 1 of 1');
	expect(text).not.toContain('Order #');
});
