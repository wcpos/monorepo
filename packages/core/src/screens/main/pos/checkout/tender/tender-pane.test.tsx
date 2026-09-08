/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { initialTenderState } from './tender-state';
import { TenderPane } from './tender-pane';

import type { TenderFlow } from './use-tender-flow';

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
jest.mock('@wcpos/components/text', () => ({ Text: 'span' }));
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

it.each([0, 2])('shows inert skeletons without a keypad while saving (%s tiles)', (count) => {
	const flow: TenderFlow = {
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
		saving: true,
		pickMethod: jest.fn(),
		takeTender: jest.fn(),
		cancelPayment: jest.fn(),
	};
	render(<TenderPane flow={flow} format={String} compact />);
	expect(screen.getAllByTestId('checkout-tile-skeleton')).toHaveLength(count || 4);
	expect(screen.queryAllByRole('button')).toHaveLength(0);
	expect(screen.queryByTestId('checkout-keypad')).toBeNull();
});
