/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { PaymentRow } from '@wcpos/order-math';

import { TerminalLegView } from './terminal-leg-view';

import type { TerminalLegState } from '../../../../../services/terminal-payments';
import type { TenderFlow } from './use-tender-flow';
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => <span data-testid="loader" /> }));
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
	[{ phase: 'final', outcome: 'released' }, 'Payment released', ['retry', 'another']],
	[{ phase: 'idle' }, 'Waiting for the customer on the terminal', ['cancel']],
];
function renderLeg(changes: Partial<TerminalLegState> = {}) {
	const flow = {
		terminalLeg: { ...base, ...changes },
		dp: 2,
		tiles: [],
		cancelTerminalLeg: jest.fn(),
		releaseTerminalLeg: jest.fn(),
		retryTerminalCapture: jest.fn(),
		retryTerminalLeg: jest.fn(),
		dismissTerminalLeg: jest.fn(),
	} as unknown as TenderFlow;
	render(<TerminalLegView flow={flow} format={(minor) => `$${(minor / 100).toFixed(2)}`} />);
	return flow;
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
			flow={{ terminalLeg: leg, tiles: [], dp: 2 } as unknown as TenderFlow}
			format={String}
		/>
	);
	expect(screen.getByTestId('checkout-terminal-status').textContent).toBe(text);
});
