/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { TenderCheckout } from './tender-checkout';
import { initialTenderState } from './tender-state';

import type { TenderFlow } from './use-tender-flow';

const mockPickMethod = jest.fn();
const mockBack = jest.fn();
let mockOnClose: (() => void) | undefined;
let mockScreenSize: 'sm' | 'md' | 'lg' = 'lg';
let mockFlow: TenderFlow;

const method = (overrides: Partial<PaymentMethodDescriptor> = {}): PaymentMethodDescriptor => ({
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
	...overrides,
});

jest.mock('./use-tender-flow', () => ({ useTenderFlow: () => mockFlow }));
jest.mock('./legacy-tab', () => ({ LegacyTab: () => <div data-testid="legacy-tab" /> }));
jest.mock('../../cart/totals-changed-banner', () => ({ TotalsChangedBanner: () => null }));
jest.mock('../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (_order: unknown, select: (record: unknown) => unknown) =>
		select({ payload: { id: 1187, number: '1187', currency_symbol: '$', line_items: [] } }),
}));

// Chrome only: the assertions are about which pane renders, not how a modal or a
// tab strip paints. Everything that carries a testID stays real.
jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children, onClose }: { children?: React.ReactNode; onClose?: () => void }) => {
		mockOnClose = onClose;
		return <div>{children}</div>;
	},
	ModalContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<button data-testid={testID}>{children}</button>
	),
	CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
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
		<button data-testid={testID} disabled={!!disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

const order = { uuid: 'order-1' } as EngineRecord<'orders'>;

function makeFlow(overrides: Partial<TenderFlow> = {}): TenderFlow {
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
		online: true,
		tiles: [{ method: method(), disabled: false, reason: null, worksOffline: true }],
		legacyMethods: [],
		methodsLoaded: true,
		unsupportedSchema: false,
		method: null,
		entryAppliedMinor: 0,
		entryChangeMinor: 0,
		quickAmountsMinor: [],
		busy: false,
		pickMethod: mockPickMethod,
		takeTender: jest.fn(),
		cancelPayment: jest.fn(),
		...overrides,
	} as TenderFlow;
}

describe('TenderCheckout', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockScreenSize = 'lg';
		mockOnClose = undefined;
		mockFlow = makeFlow();
	});

	it('shows the ledger pane beside the tenders on a wide screen', () => {
		render(<TenderCheckout order={order} />);

		expect(screen.getByTestId('checkout-server-order-id').textContent).toBe('1187');
		expect(screen.getByTestId('checkout-order-total').textContent).toBe('$92.95');
		expect(screen.queryByTestId('checkout-balance-bar')).toBeNull();
	});

	it('collapses the ledger to a balance bar on a phone', () => {
		mockScreenSize = 'sm';

		render(<TenderCheckout order={order} />);

		expect(screen.getByTestId('checkout-balance-bar')).not.toBeNull();
		// The order lines and the order total are what the bar drops; the balance stays.
		expect(screen.queryByTestId('checkout-order-total')).toBeNull();
		expect(screen.getByTestId('checkout-balance').textContent).toBe('$92.95');
	});

	it('renders an undrivable method disabled, with the reason, rather than hiding it', () => {
		mockFlow = makeFlow({
			tiles: [
				{
					method: method({ id: 'square_terminal', title: 'Square Terminal' }),
					disabled: true,
					reason: 'unsupported_mode',
					worksOffline: false,
				},
			],
		});

		render(<TenderCheckout order={order} />);

		const tile = screen.getByTestId('checkout-tile-square_terminal') as HTMLButtonElement;
		expect(tile.disabled).toBe(true);
		expect(tile.textContent).toContain('pos_checkout.update_app_to_use');

		fireEvent.click(tile);
		expect(mockPickMethod).not.toHaveBeenCalled();
	});

	it('offers Cancel payment only once the ledger holds live money', () => {
		const empty = render(<TenderCheckout order={order} />);
		expect(screen.queryByTestId('checkout-cancel-payment')).toBeNull();
		empty.unmount();

		mockFlow = makeFlow({ hasLiveLeg: true, paidMinor: 5000, balanceMinor: 4295 });
		render(<TenderCheckout order={order} />);

		expect(screen.queryByTestId('checkout-cancel-payment')).not.toBeNull();
	});

	it('does not close a live payment while its cancellation view is open', () => {
		mockFlow = makeFlow({
			hasLiveLeg: true,
			state: { ...initialTenderState, view: 'cancel' },
		});
		render(<TenderCheckout order={order} />);

		mockOnClose?.();

		expect(mockBack).not.toHaveBeenCalled();
	});

	it('offers a completion action for a zero-total order', () => {
		const takeTender = jest.fn();
		mockFlow = makeFlow({ totalMinor: 0, balanceMinor: 0, takeTender });
		render(<TenderCheckout order={order} />);

		fireEvent.click(screen.getByTestId('checkout-complete-order'));

		expect(takeTender).toHaveBeenCalledTimes(1);
	});
});
