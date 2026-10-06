/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';
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
// The UI-thread animation runtime is unavailable in jsdom; every animation lands on its
// target at once and the rendered View keeps its className (the step badges are read by it).
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	// The mocked View, so an animated layer keeps its className too.
	default: {
		get View() {
			return jest.requireMock('react-native').View;
		},
	},
	useSharedValue: (value: number) => React.useRef({ value }).current,
	useAnimatedStyle: (style: () => object) => style(),
	withTiming: (value: number) => value,
	withSpring: (value: number) => value,
	withDelay: (_delay: number, value: number) => value,
	withSequence: (...steps: number[]) => steps.at(-1),
	withRepeat: (value: number) => value,
	cancelAnimation: jest.fn(),
	ReduceMotion: { System: 'system' },
	Easing: {
		bezier: jest.fn(),
		linear: (value: number) => value,
		inOut: (easing: unknown) => easing,
		cubic: (value: number) => value,
	},
}));
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
	TextClassContext: React.createContext(''),
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
// A controlled stand-in: the trigger reports the toggle, so Copy can appear beside Details.
jest.mock('@wcpos/components/collapsible', () => {
	const Ctx = React.createContext<{ open?: boolean; onOpenChange?: (open: boolean) => void }>({});
	return {
		Collapsible: ({
			children,
			open,
			onOpenChange,
		}: {
			children?: React.ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}) => <Ctx.Provider value={{ open, onOpenChange }}>{children}</Ctx.Provider>,
		CollapsibleTrigger: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => {
			const { open, onOpenChange } = React.useContext(Ctx);
			return (
				<button data-testid={testID} onClick={() => onOpenChange?.(!open)}>
					{children}
				</button>
			);
		},
		CollapsibleContent: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
			<div data-testid={testID}>{children}</div>
		),
	};
});
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
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
});
// The wobble is a line in the log, not a second sentence under the status (said once).
it('reads the connection warning as a log line', () => {
	renderLeg({
		unstable: true,
		clientEvents: [{ t: '2026-10-05T13:15:12Z', level: 'warning', message: 'Connection unstable' }],
	});
	expect(screen.getByTestId('checkout-terminal-log').textContent).toContain(
		'Connection unstable, still trying'
	);
	expect(screen.getByTestId('checkout-terminal-leg').textContent).not.toContain('still waiting');
});
// The end of a leg closes the node it stopped on: red with a cross when the payment failed,
// grey with a dash when nobody lost money (StepProgress `failed` / `stopped`).
it.each([
	['failed', 'bg-destructive', 'Declined or cancelled on the terminal'],
	['voided', 'bg-muted-foreground', 'Payment cancelled'],
	['released', 'bg-muted-foreground', 'Payment released'],
] as const)('marks a %s leg on the node', (outcome, tone, status) => {
	const flow = renderLeg({
		row: {
			...row,
			failure_reason: 'declined_or_cancelled',
			events: [{ t: '2026-10-05T13:14:54Z', level: 'info', message: 'Reader action cancelled' }],
		},
	});
	flow.update({ phase: 'final', outcome });
	expect(screen.getByTestId('checkout-terminal-status').textContent).toContain(status);
	// The step it stopped on stays the selected one; the badge there closes in the end's tone.
	const node = screen.getByTestId('checkout-terminal-step-1');
	expect(node.getAttribute('aria-selected')).toBe('true');
	expect(node.innerHTML.includes(tone)).toBe(true);
	if (outcome === 'failed')
		expect(screen.getByTestId('checkout-terminal-log').textContent).toContain(
			'Declined or cancelled on the terminal'
		);
});
it('renders retained partial capture finishing errors without offering recollection', () => {
	renderLeg({
		phase: 'final',
		outcome: 'captured',
		settlement: {
			payment: row,
			outcome: 'captured',
			saleComplete: false,
			finishingError: 'local write failed',
		},
	});
	expect(screen.queryByTestId('checkout-terminal-finishing-error')).not.toBeNull();
	expect(screen.getByTestId('checkout-terminal-finishing-details').textContent).toContain(
		'local write failed'
	);
	fireEvent.click(screen.getByTestId('checkout-terminal-finishing-help'));
	expect(openExternalURL).toHaveBeenCalledWith('https://docs.wcpos.com/error-codes/PAYMENT121');
	for (const action of actions)
		expect(screen.queryByTestId(`checkout-terminal-${action}`)).toBeNull();
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
	// Copy appears beside Details once the log is open and copies the lines as text: the level
	// word on a warning or error, the reader under the first line.
	fireEvent.click(screen.getByTestId('checkout-terminal-log-toggle'));
	fireEvent.click(screen.getByTestId('checkout-terminal-log-copy'));
	expect(writeText).toHaveBeenCalledWith(
		expect.stringMatching(
			/\d{2}:\d{2}:01  warn First\n {10}Reader  reader\n\d{2}:\d{2}:02  error Last$/
		)
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
		// Every badge layer stays mounted and the mocked View drops styles, so the selected
		// node is the one readable signal of which step is live.
		expect(dot.getAttribute('aria-selected')).toBe(String(index === current));
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
});

it('keeps Approved through cancellation and release', () => {
	const flow = renderLeg({ capturing: true });
	flow.update({ phase: 'cancelling', capturing: false });
	flow.update({ phase: 'polling', cancelRequested: true });
	flow.update({ phase: 'final', outcome: 'released' });
	expect(screen.getByTestId('checkout-terminal-step-2').getAttribute('aria-selected')).toBe('true');
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
	expect(screen.getByTestId('checkout-terminal-leg').textContent).toContain('Connected · 82%');
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
