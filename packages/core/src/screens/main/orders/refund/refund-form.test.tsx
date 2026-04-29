/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import { RefundOrderForm } from './form';

jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children }: any) => <>{children}</>,
	AlertDialogAction: ({ children, onPress, loading, ...props }: any) => (
		<button onClick={onPress} {...props}>
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
			<input aria-label={label} {...props} />
		</label>
	),
	FormTextarea: ({ label, ...props }: any) => (
		<label>
			{label}
			<textarea aria-label={label} {...props} />
		</label>
	),
}));

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/modal', () => ({
	ModalAction: ({ children, onPress, loading, ...props }: any) => (
		<button onClick={onPress} {...props}>
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
} as never;

describe('RefundOrderForm', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('formats the summary totals and enables original-method refunds when supported', async () => {
		mockGet.mockResolvedValue({
			data: [
				{
					id: 'stripe_terminal_for_woocommerce',
					capabilities: { supports_provider_refunds: true },
				},
			],
		});

		render(<RefundOrderForm order={order} />);

		await waitFor(() => expect(screen.getByText(/common.total: €155.00/)).toBeInTheDocument());
		expect(screen.getByText(/orders.previously_refunded: -€10.00/)).toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getByLabelText('orders.refund_to_original_method')).toBeEnabled()
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
		expect(screen.getByLabelText('orders.refund_to_original_method')).toBeDisabled();
		expect(screen.getByLabelText('orders.refund_to_cash')).toBeEnabled();
	});
});
