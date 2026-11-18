/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import { createTestT } from '../../../../../../jest/translate';
import { PaymentSection } from './payment';
import { splitWith } from '../../../pos/checkout/tender/tender-figures.test-utils';

import type { LedgerView } from '../../../pos/checkout/tender/use-ledger-view';

const mockT = createTestT();
const mockCorrect = jest.fn();
let mockView: LedgerView & { format: (minor: number) => string };
let mockMethods: PaymentMethodDescriptor[] = [];
let mockCapable = true;
let mockStatus = 'online-website-available';

type Props = React.PropsWithChildren<{ testID?: string }>;
function mockDiv({ children, testID }: Props) {
	return <div data-testid={testID}>{children}</div>;
}
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: ({ testID, title }: { testID?: string; title: string }) => (
		<span data-testid={testID}>{title}</span>
	),
}));
jest.mock('react-native', () => ({ View: mockDiv }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockDiv }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: mockDiv }));
jest.mock('@wcpos/components/text', () => ({ Text: mockDiv }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, testID }: { label: string; testID?: string }) => (
		<span data-testid={testID}>{label}</span>
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, onPress }: Props & { onPress: () => void }) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: Props) => <div>{children}</div>,
	DialogContent: mockDiv,
	DialogHeader: mockDiv,
	DialogTitle: mockDiv,
	DialogBody: mockDiv,
	DialogFooter: ({
		intent,
	}: {
		intent: { label: string; testID: string; disabled: boolean; onPress: () => void };
	}) => (
		<button data-testid={intent.testID} disabled={intent.disabled} onClick={intent.onPress}>
			{intent.label}
		</button>
	),
}));
jest.mock('@wcpos/components/radio-group', () => {
	const ReactActual = jest.requireActual('react');
	const Pick = ReactActual.createContext(() => undefined);
	return {
		RadioGroup: ({ children, onValueChange }: Props & { onValueChange: (v: string) => void }) => (
			<Pick.Provider value={onValueChange}>{children}</Pick.Provider>
		),
		RadioGroupOption: ({
			value,
			label,
			testID,
		}: {
			value: string;
			label: string;
			testID: string;
		}) => {
			const pick = ReactActual.useContext(Pick);
			return (
				<button data-testid={testID} onClick={() => pick(value)}>
					{label}
				</button>
			);
		},
	};
});
jest.mock('@wcpos/query', () => ({
	useRecordField: (r: unknown, select: (r: unknown) => unknown) => select(r),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('./_section', () => ({
	Section: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
}));
jest.mock('../../use-store-capability', () => ({ useStoreCapability: () => mockCapable }));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: mockMethods }),
}));
jest.mock('../../../pos/checkout/payments/use-correct-tender', () => ({
	useCorrectTender: () => mockCorrect,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '12:48' }),
}));
jest.mock('../../../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ dateTime: () => 'Today · 12:48' }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `$${n.toFixed(2)}` }),
}));
jest.mock('../../../hooks/use-date-format', () => ({ useDateFormat: () => null }));
jest.mock('../../../pos/checkout/tender/use-ledger-view', () => ({
	useLedgerView: () => mockView,
}));

function leg(overrides: Partial<PaymentRow> = {}): PaymentRow {
	// prettier-ignore
	return {
		id: 'orig', source: 'app', order_id: 12, method_id: 'pos_card', provider: null,
		kind: 'card', capture_mode: 'manual', transport: null, recorded_offline: false,
		amount: '7.73', currency: 'USD', tendered: '7.73', change: '0.00', tip: null,
		status: 'captured', failure_reason: null, refunded_amount: '0.00', refunds: [],
		provider_refs: {}, receipt: {}, cashier_id: 1, store_id: null, events: [],
		created_at_gmt: '', captured_at_gmt: '', updated_at_gmt: '', ...overrides,
	} as PaymentRow;
}
function method(id: string, overrides: Partial<PaymentMethodDescriptor> = {}) {
	// prettier-ignore
	return {
		schema: 1, id, title: id, kind: 'cash', pos_enabled: true, order: 0,
		capture: { mode: 'manual', provider: null, hardware: null, webview_available: false,
			modes: [{ mode: 'manual', provider: null, hardware: null }] },
		capabilities: {}, defaults: { order_status: 'completed', rounding: null, open_drawer: false },
		provider_data: {}, ...overrides,
	} as PaymentMethodDescriptor;
}
const card = method('pos_card', { title: 'Card' });
const cheque = method('pos_cheque', { title: 'Cheque' });
// 7.73 is no multiple of 0.05: the store refuses `off_rounding_increment`, so it is never offered.
const cash = method('pos_cash', {
	title: 'Cash',
	defaults: {
		order_status: 'completed',
		rounding: { increment: '0.05', mode: 'nearest' },
		open_drawer: false,
	},
});
const terminal = method('stripe_terminal', {
	title: 'Terminal',
	capture: { mode: 'terminal', provider: 'stripe', hardware: null, webview_available: false },
});
const viewWith = (rows: PaymentRow[]): typeof mockView => ({
	rows,
	invoiceSent: null,
	tiles: [],
	dp: 2,
	totalMinor: 773,
	paidMinor: 773,
	balanceMinor: 0,
	split: splitWith(),
	format: (minor: number) => `$${(minor / 100).toFixed(2)}`,
});
const order = {
	uuid: 'one',
	payload: { total: '7.73', status: 'completed', meta_data: [] },
} as never;
const changeTender = (id = 'orig') => screen.queryByTestId(`order-payment-change-tender-${id}`);

beforeEach(() => {
	jest.clearAllMocks();
	mockView = viewWith([leg()]);
	mockMethods = [card, cheque, cash, terminal];
	mockCapable = true;
	mockStatus = 'online-website-available';
	mockCorrect.mockResolvedValue('done');
});

describe('PaymentSection change tender (#3647 test 10)', () => {
	it('offers Change tender when Pro, healthy, online, advertised, correctable and targeted', () => {
		render(<PaymentSection order={order} canChangeTender />);
		expect(changeTender()?.textContent).toBe('Change tender');
	});

	it.each<[string, { canChangeTender?: boolean }, () => unknown]>([
		['not allowed (Free read-only, and the default)', {}, () => undefined],
		['storage degraded (canChangeTender false)', { canChangeTender: false }, () => undefined],
		['no capability', { canChangeTender: true }, () => (mockCapable = false)],
		['offline', { canChangeTender: true }, () => (mockStatus = 'online-website-unavailable')],
		['no target method', { canChangeTender: true }, () => (mockMethods = [card, cash, terminal])],
		[
			'a provider row',
			{ canChangeTender: true },
			() => (mockView = viewWith([leg({ provider: 'stripe' })])),
		],
	])('is hidden when %s', (_name, props, arrange) => {
		arrange();
		render(<PaymentSection order={order} {...props} />);
		expect(changeTender()).toBeNull();
	});

	it('the sheet lists only the targets the store accepts, and confirms the picked one', async () => {
		render(<PaymentSection order={order} canChangeTender />);
		fireEvent.click(changeTender()!);
		expect(screen.getByTestId('change-tender-sheet').textContent).toContain('Card $7.73');
		expect(screen.getByTestId('change-tender-method-pos_cheque')).toBeTruthy();
		for (const id of ['pos_card', 'pos_cash', 'stripe_terminal'])
			expect(screen.queryByTestId(`change-tender-method-${id}`)).toBeNull();
		expect(screen.getByTestId('change-tender-confirm').hasAttribute('disabled')).toBe(true);

		fireEvent.click(screen.getByTestId('change-tender-method-pos_cheque'));
		const confirm = screen.getByTestId('change-tender-confirm');
		expect(confirm.textContent).toBe('Change to Cheque');
		fireEvent.click(confirm);
		expect(mockCorrect).toHaveBeenCalledWith(order, 'orig', { id: 'pos_cheque', title: 'Cheque' });
		await waitFor(() => expect(screen.queryByTestId('change-tender-sheet')).toBeNull());
		expect(screen.queryByTestId('change-tender-sheet')).toBeNull();
	});

	it('E5: an unconfirmed outcome closes the sheet; a refusal keeps it open', async () => {
		mockCorrect.mockResolvedValueOnce('unconfirmed').mockResolvedValueOnce('refused');
		render(<PaymentSection order={order} canChangeTender />);
		fireEvent.click(changeTender()!);
		fireEvent.click(screen.getByTestId('change-tender-method-pos_cheque'));
		fireEvent.click(screen.getByTestId('change-tender-confirm'));
		await waitFor(() => expect(screen.queryByTestId('change-tender-sheet')).toBeNull());

		fireEvent.click(changeTender()!);
		fireEvent.click(screen.getByTestId('change-tender-method-pos_cheque'));
		fireEvent.click(screen.getByTestId('change-tender-confirm'));
		await waitFor(() => expect(mockCorrect).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(screen.getByTestId('change-tender-confirm').hasAttribute('disabled')).toBe(false)
		);
		expect(screen.getByTestId('change-tender-sheet')).toBeTruthy();
	});

	it.each<[string, Record<string, unknown>]>([
		['a partial refund that names no leg', { refunds: [{ id: 9, total: '-2.00' }] }],
		['status refunded', { status: 'refunded' }],
	])('E4: no leg offers Change tender on an order with %s', (_name, payload) => {
		const refunded = {
			uuid: 'one',
			payload: { total: '7.73', status: 'completed', meta_data: [], ...payload },
		};
		render(<PaymentSection order={refunded as never} canChangeTender />);
		expect(changeTender()).toBeNull();
	});

	it('E4: an order with no refunds still offers Change tender', () => {
		const unrefunded = {
			uuid: 'one',
			payload: { total: '7.73', status: 'completed', meta_data: [], refunds: [] },
		};
		render(<PaymentSection order={unrefunded as never} canChangeTender />);
		expect(changeTender()?.textContent).toBe('Change tender');
	});

	it('a corrected original reads Corrected with no action; R- is not a leg; R+ names its source', () => {
		const minus = leg({
			id: 'rminus',
			amount: '-7.73',
			entry: 'tender_correction',
			reverses: 'orig',
		});
		const plus = leg({
			id: 'rplus',
			method_id: 'pos_cheque',
			entry: 'tender_correction',
			corrects: 'orig',
		});
		mockView = viewWith([leg(), minus, plus]);
		render(<PaymentSection order={order} canChangeTender />);
		expect(screen.getByTestId('checkout-leg-corrected-orig').textContent).toBe('Corrected');
		expect(changeTender('orig')).toBeNull();
		expect(screen.queryByTestId('checkout-leg-rminus')).toBeNull();
		expect(changeTender('rminus')).toBeNull();
		expect(screen.getByTestId('checkout-leg-corrected-from-rplus').textContent).toBe(
			'Corrected from pos_card'
		);
	});
});
