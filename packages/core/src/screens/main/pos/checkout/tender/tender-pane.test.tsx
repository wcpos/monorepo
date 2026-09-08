/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { initialTenderState } from './tender-state';
import { TenderPane } from './tender-pane';

import type { TenderFlow } from './use-tender-flow';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button data-testid={testID}>{children}</button>
	),
	ButtonText: 'span',
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
// The leg view has its own suite; here it only needs to stay out of the saving skeleton's way.
jest.mock('./terminal-leg-view', () => ({ TerminalLegView: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
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
		state: initialTenderState,
		dispatch: jest.fn(),
		dp: 2,
		totalMinor: 9295,
		paidMinor: 0,
		balanceMinor: 9295,
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
it.each([0, 2])('shows inert skeletons without a keypad while saving (%s tiles)', (count) => {
	const flow = makeFlow(count);
	render(<TenderPane flow={flow} format={String} compact />);
	expect(screen.getAllByTestId('checkout-tile-skeleton')).toHaveLength(count || 4);
	expect(screen.queryAllByRole('button')).toHaveLength(0);
	expect(screen.queryByTestId('checkout-keypad')).toBeNull();
	expect(screen.queryByTestId('checkout-save-slow')).toBeNull();
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
		expect(screen.getAllByTestId('checkout-tile-skeleton')).toHaveLength(1);
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
