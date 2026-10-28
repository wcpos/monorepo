/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { createTestT } from '../../../../../../jest/translate';
import { PaymentSection } from './payment';

import type { LedgerView } from '../../../pos/checkout/tender/use-ledger-view';

const mockT = createTestT();
let mockView: LedgerView & { format: (minor: number) => string };

type Props = React.PropsWithChildren<{ testID?: string }>;
function mockDiv({ children, testID }: Props) {
	return <div data-testid={testID}>{children}</div>;
}
jest.mock('react-native', () => ({ View: mockDiv }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockDiv }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: mockDiv }));
jest.mock('@wcpos/components/text', () => ({ Text: mockDiv }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (r: unknown, select: (r: unknown) => unknown) => select(r),
}));
jest.mock('./_section', () => ({
	Section: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => (
		<section>
			<h2>{title}</h2>
			{children}
		</section>
	),
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

const minorFormat = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const leg = (id: string, amount: string) =>
	({ id, method_id: 'pos_card', kind: 'card', amount, status: 'captured', events: [] }) as never;
const viewWith = (rows: LedgerView['rows'], paidMinor: number): typeof mockView => ({
	rows,
	invoiceSent: null,
	tiles: [],
	dp: 2,
	totalMinor: 770,
	paidMinor,
	balanceMinor: 770 - paidMinor,
	format: minorFormat,
});
const record = (payload: Record<string, unknown>) =>
	({ uuid: 'one', payload: { total: '7.70', meta_data: [], ...payload } }) as never;

describe('PaymentSection', () => {
	it('closes on Total, Paid and Remaining while the order still owes money', () => {
		mockView = viewWith([leg('a', '5.00')], 500);
		render(<PaymentSection order={record({ status: 'pos-partial' })} />);

		expect(screen.getByText('Payment')).not.toBeNull();
		expect(screen.getByTestId('checkout-leg-a')).not.toBeNull();
		expect(screen.getByTestId('checkout-ledger-totals')).not.toBeNull();
		expect(screen.getByTestId('checkout-ledger-remaining').textContent).toBe('$2.70');
	});

	it('shows just the legs once the order is paid, under "Payments" when there are several', () => {
		mockView = viewWith([leg('a', '5.00'), leg('b', '2.70')], 770);
		render(<PaymentSection order={record({ status: 'completed' })} />);

		expect(screen.getByText('Payments')).not.toBeNull();
		expect(screen.getByTestId('checkout-leg-b')).not.toBeNull();
		expect(screen.queryByTestId('checkout-ledger-totals')).toBeNull();
		expect(screen.queryByTestId('checkout-ledger-remaining')).toBeNull();
	});

	it('an unpaid order with a method set says no payments yet and what is owed, never a paid row', () => {
		mockView = viewWith([], 0);
		render(
			<PaymentSection
				order={record({
					status: 'pos-open',
					payment_method: 'pos_cash',
					payment_method_title: 'Cash',
				})}
			/>
		);
		expect(screen.queryByTestId('order-modal-payment')).toBeNull();
		expect(screen.getByTestId('checkout-ledger-remaining').textContent).toBe('$7.70');
	});

	it('a refunded order keeps its legs as history but never closes on Remaining', () => {
		mockView = viewWith([leg('a', '7.70')], 0);
		mockView.balanceMinor = 770; // the journal counts the refund back as owed
		render(<PaymentSection order={record({ status: 'refunded' })} />);
		expect(screen.getByTestId('checkout-ledger')).not.toBeNull();
		expect(screen.queryByTestId('checkout-ledger-remaining')).toBeNull();
	});

	it('a completed sale with a partial refund never closes on Remaining', () => {
		mockView = viewWith([leg('a', '7.70')], 770);
		mockView.balanceMinor = 200; // the journal adds the refund back
		render(
			<PaymentSection
				order={record({
					status: 'completed',
					date_paid_gmt: '2026-10-23T12:48:00',
					refunds: [{ id: 9, total: '-2.00' }],
				})}
			/>
		);
		expect(screen.getByTestId('checkout-ledger')).not.toBeNull();
		expect(screen.queryByTestId('checkout-ledger-remaining')).toBeNull();
		expect(document.body.textContent).toContain('Refund$-2.00');
	});

	it('a completed order with no journal and no date_paid is settled: the method row, nothing owed', () => {
		mockView = viewWith([], 0);
		render(
			<PaymentSection
				order={record({
					status: 'completed',
					payment_method: 'bacs',
					payment_method_title: 'Bank transfer',
				})}
			/>
		);
		expect(screen.getByTestId('order-modal-payment').textContent).toBe('Bank transfer$7.70');
		expect(screen.queryByTestId('checkout-ledger-remaining')).toBeNull();
	});

	it('a cancelled order with a method set shows the method row with no Captured badge', () => {
		mockView = viewWith([], 0);
		render(
			<PaymentSection
				order={record({
					status: 'cancelled',
					payment_method: 'pos_cash',
					payment_method_title: 'Cash',
				})}
			/>
		);
		expect(screen.getByTestId('order-modal-payment').textContent).toBe('Cash$7.70');
		expect(screen.queryByTestId('checkout-ledger-remaining')).toBeNull();
	});

	it('draws one row from Woo’s own fields for an order with no POS journal (paid online)', () => {
		mockView = viewWith([], 0);
		render(
			<PaymentSection
				order={record({
					payment_method: 'stripe',
					payment_method_title: 'Credit card',
					date_paid_gmt: '2026-10-23T12:48:00',
					transaction_id: 'ch_123',
				})}
			/>
		);

		const row = screen.getByTestId('order-modal-payment');
		expect(row.textContent).toContain('Credit card$7.70Captured');
		expect(row.textContent).toContain('Captured Today · 12:48');
		expect(row.textContent).toContain('Transaction ID ch_123');
		expect(screen.queryByTestId('checkout-ledger')).toBeNull();
	});
});
