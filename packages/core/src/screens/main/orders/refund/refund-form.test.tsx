/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';

import { RefundOrderForm } from './form';

function mockWebProps({ testID, ...props }: any) {
	return testID ? { ...props, 'data-testid': testID } : props;
}

jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children }: any) => <>{children}</>,
	AlertDialogAction: ({ children, onPress, loading, ...props }: any) => (
		<button onClick={onPress} {...mockWebProps(props)}>
			{children}
		</button>
	),
	AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
	AlertDialogContent: ({ children }: any) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
	AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
	AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: any) => <form>{children}</form>,
	FormField: ({ render, name }: any) =>
		render({
			field: { name, value: '', onChange: jest.fn(), onBlur: jest.fn() },
		}),
	FormInput: ({ label, ...props }: any) => (
		<label>
			{label}
			<input aria-label={label} {...mockWebProps(props)} />
		</label>
	),
	FormTextarea: ({ label, ...props }: any) => (
		<label>
			{label}
			<textarea aria-label={label} {...mockWebProps(props)} />
		</label>
	),
}));

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/modal', () => ({
	ModalAction: ({ children, onPress, loading, ...props }: any) => (
		<button onClick={onPress} {...mockWebProps(props)}>
			{children}
		</button>
	),
	ModalClose: ({ children }: any) => <button>{children}</button>,
	ModalFooter: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/table', () => ({
	Table: ({ children }: any) => <table>{children}</table>,
	TableBody: ({ children }: any) => <tbody>{children}</tbody>,
	TableCell: ({ children }: any) => <td>{children}</td>,
	TableHead: ({ children }: any) => <th>{children}</th>,
	TableHeader: ({ children }: any) => <thead>{children}</thead>,
	TableRow: ({ children }: any) => <tr>{children}</tr>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children }: any) => <label>{children}</label>,
}));
jest.mock('@wcpos/components/radio-group', () => ({
	RadioGroup: ({ children, value }: any) => (
		<div role="radiogroup" data-value={value}>
			{children}
		</div>
	),
	RadioGroupItem: ({ value, disabled, testID }: any) => (
		<input type="radio" value={value} disabled={disabled} data-testid={testID} />
	),
	RadioGroupOption: ({ value, disabled, testID, label, description }: any) => (
		<label>
			{label}
			<input
				type="radio"
				aria-label={label}
				value={value}
				disabled={disabled}
				data-testid={testID}
			/>
			{description ? <span>{description}</span> : null}
		</label>
	),
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: any) => observable?.getValue?.(),
}));

const mockUseRefundMutation = jest.fn(() => jest.fn());
const mockUseRouter = jest.fn(() => ({ back: jest.fn() }));
const mockGet = jest.fn();

jest.mock('./use-refund-mutation', () => ({
	useRefundMutation: () => mockUseRefundMutation(),
}));
jest.mock('expo-router', () => ({ useRouter: () => mockUseRouter() }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: any) => (vars?.gateway ? `${key}:${vars.gateway}` : key),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			wc_price_decimals$: {
				getValue: () => 2,
				subscribe: () => ({ unsubscribe() {} }),
			},
		},
	}),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({
		format: (value: number) =>
			value < 0 ? `-€${Math.abs(value).toFixed(2)}` : `€${value.toFixed(2)}`,
	}),
}));

const order = {
	id: 23858,
	currency_symbol: '€',
	total: '155.000000',
	payment_method: 'stripe_terminal_for_woocommerce',
	payment_method_title: 'Stripe Terminal',
	refunds: [{ total: '-10.00' }],
	line_items: [],
} as any;

describe('RefundOrderForm', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('formats the summary totals and enables original-method refunds when supported', async () => {
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') {
				return Promise.resolve({
					data: [
						{
							id: 'stripe_terminal_for_woocommerce',
							capabilities: { supports_provider_refunds: true },
						},
					],
				});
			}
			return Promise.resolve({
				data: order.refunds,
				headers: { 'x-wp-totalpages': '1' },
			});
		});

		render(<RefundOrderForm order={order} />);

		await waitFor(() => expect(screen.getByText(/common.total: €155.00/)).toBeInTheDocument());
		expect(screen.getByText(/orders.previously_refunded: -€10.00/)).toBeInTheDocument();
		await waitFor(() =>
			expect(
				screen.getByLabelText('orders.refund_to_original_method:Stripe Terminal')
			).toBeEnabled()
		);
		await waitFor(() =>
			expect(screen.getByRole('radiogroup')).toHaveAttribute('data-value', 'original_method')
		);
		expect(screen.getByLabelText('orders.refund_to_cash')).toBeEnabled();
	});

	it('forces cash-only mode and shows a warning when the gateway lookup fails', async () => {
		mockGet.mockRejectedValue(new Error('boom'));

		render(<RefundOrderForm order={order} />);

		await waitFor(() =>
			expect(screen.getByText('orders.original_method_refund_lookup_failed')).toBeInTheDocument()
		);
		expect(
			screen.getByLabelText('orders.refund_to_original_method:Stripe Terminal')
		).toBeDisabled();
		expect(screen.getByLabelText('orders.refund_to_cash')).toBeEnabled();
	});

	it('labels original-method refunds with the order payment method title', async () => {
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') {
				return Promise.resolve({
					data: [
						{
							id: 'stripe_terminal_for_woocommerce',
							capabilities: { supports_provider_refunds: true },
						},
					],
				});
			}
			return Promise.resolve({
				data: order.refunds,
				headers: { 'x-wp-totalpages': '1' },
			});
		});

		render(<RefundOrderForm order={order} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText('orders.refund_to_original_method:Stripe Terminal')
			).toBeEnabled()
		);
	});

	it('hides refund destination options for POS cash orders', async () => {
		mockGet.mockResolvedValue({
			data: [
				{
					id: 'pos_cash',
					capabilities: { supports_provider_refunds: false },
				},
			],
		});

		render(<RefundOrderForm order={{ ...order, payment_method: 'pos_cash' } as never} />);

		await waitFor(() =>
			expect(screen.queryByText('orders.refund_destination')).not.toBeInTheDocument()
		);
		expect(screen.queryByTestId('refund-destination-original_method')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('orders.refund_to_cash')).not.toBeInTheDocument();
	});

	it('does not show gateway lookup warnings for POS cash orders', async () => {
		mockGet.mockRejectedValue(new Error('boom'));

		render(<RefundOrderForm order={{ ...order, payment_method: 'pos_cash' } as never} />);

		await waitFor(() => expect(mockGet).toHaveBeenCalled());
		expect(
			screen.queryByText('orders.original_method_refund_lookup_failed')
		).not.toBeInTheDocument();
	});

	it('uses fetched refund history amounts for the previously refunded total', async () => {
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') return Promise.resolve({ data: [] });
			return Promise.resolve({
				data: [{ amount: '10.00' }, { amount: '15.00' }],
				headers: { 'x-wp-totalpages': '1' },
			});
		});

		render(<RefundOrderForm order={order} />);

		await waitFor(() =>
			expect(screen.getByText(/orders.previously_refunded: -€25.00/)).toBeInTheDocument()
		);
	});

	it('holds line quantities at zero until detailed refund rows load', async () => {
		const orderWithLine = {
			...order,
			line_items: [
				{
					id: 77,
					name: 'Delayed item',
					quantity: 2,
					total: '20.00',
					total_tax: '4.00',
					taxes: [{ id: 1, total: '4.00' }],
				},
			],
		} as never;
		let resolveRefunds: (value: any) => void = () => {};
		const refundsPromise = new Promise((resolve) => {
			resolveRefunds = resolve;
		});
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') return Promise.resolve({ data: [] });
			return refundsPromise;
		});

		render(<RefundOrderForm order={orderWithLine} />);

		let row = screen.getByText('Delayed item').closest('tr') as HTMLElement;
		expect(within(row).queryByText('2')).not.toBeInTheDocument();
		expect(within(row).getAllByText('0').length).toBeGreaterThan(0);

		resolveRefunds({ data: [], headers: { 'x-wp-totalpages': '1' } });

		await waitFor(() => {
			row = screen.getByText('Delayed item').closest('tr') as HTMLElement;
			expect(within(row).getByText('2')).toBeInTheDocument();
		});
	});

	it('displays tax-inclusive unit prices and remaining refundable quantity', async () => {
		const partiallyRefundedOrder = {
			...order,
			line_items: [
				{
					id: 55,
					name: 'Belt',
					quantity: 2,
					total: '84.16',
					total_tax: '16.84',
					taxes: [{ id: 1, total: '16.84' }],
				},
			],
			refunds: [
				{
					total: '-50.50',
					line_items: [{ id: 55, quantity: 1 }],
				},
			],
		} as never;
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') return Promise.resolve({ data: [] });
			return Promise.resolve({
				data: (partiallyRefundedOrder as any).refunds,
				headers: { 'x-wp-totalpages': '1' },
			});
		});

		render(<RefundOrderForm order={partiallyRefundedOrder} />);

		await waitFor(() => expect(screen.getByText('50.50')).toBeInTheDocument());
		await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
	});

	it('requests every refund page when the refunds endpoint is paginated', async () => {
		mockGet.mockImplementation((url: string, config: any) => {
			if (url === 'payment-gateways') return Promise.resolve({ data: [] });
			if (config?.params?.page === 1) {
				return Promise.resolve({
					data: [],
					headers: { 'x-wp-totalpages': '2' },
				});
			}
			return Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '2' } });
		});

		render(<RefundOrderForm order={order} />);

		await waitFor(() =>
			expect(mockGet).toHaveBeenCalledWith(
				'orders/23858/refunds',
				expect.objectContaining({ params: { page: 2, per_page: 100 } })
			)
		);
	});
});
