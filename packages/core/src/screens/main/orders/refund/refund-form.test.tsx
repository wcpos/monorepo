/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useController } from 'react-hook-form';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { DeviceScope } from '@wcpos/components/lib/device';
import { getLogger } from '@wcpos/utils/logger';

import { RefundOrderForm } from './form';
import { RefundUnconfirmedError } from './refund-failure';

function mockWebProps({ testID, ...props }: any) {
	return testID ? { ...props, 'data-testid': testID } : props;
}

let mockEnableRefundActions = false;
let mockOnlineStatus = 'online-website-available';
let mockSpacingUnit = 4;
// The refund form's heads grow with their text (TableHead's own h-9 does not).
const HEAD_GROWS = 'h-auto min-h-9 py-1';
jest.mock('@wcpos/components/lib/use-spacing-unit', () => ({
	useSpacingUnit: () => mockSpacingUnit,
}));

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));

// The tax provider's own boundary (its fallback loads an icon jest's CommonJS runtime cannot).
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children, open }: any) => (
		<div data-testid="refund-confirm-dialog" data-open={open}>
			{children}
		</div>
	),
	AlertDialogContent: ({ children }: any) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
	AlertDialogFooter: (props: import('@wcpos/components/alert-dialog').AlertDialogFooterProps) => {
		const Footer = jest.requireActual('../../../../../jest/footer.test-utils').AlertDialogFooter;
		return (
			<Footer
				{...props}
				confirm={{
					...props.confirm,
					disabled: mockEnableRefundActions ? false : props.confirm.disabled,
				}}
			/>
		);
	},
	AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
}));

// The custom amount is wired to the real form state so a test can enter a refund amount.
function MockControlledField({ render, name, control }: any) {
	return render(useController({ control, name }));
}

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: any) => <form>{children}</form>,
	FormField: ({ render, name, control }: any) =>
		name === 'custom_amount' || /^line_items\.\d+\.refund_qty$/.test(name) ? (
			<MockControlledField render={render} name={name} control={control} />
		) : (
			render({
				field: { name, value: '', onChange: jest.fn(), onBlur: jest.fn() },
			})
		),
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

// FormInput is mocked; its keypad fields never render. The custom amount renders a plain input, and
// the count fields render too, addressed by their field name.
jest.mock('../../components/amount-field', () => ({
	AmountField: () => null,
	FormAmountField: ({ testID, name, kind, onChange, disabled, ...props }: any) => {
		const id = testID ?? (kind === 'count' ? name : undefined);
		return id ? (
			<input
				data-testid={id}
				disabled={disabled}
				aria-labelledby={props['aria-labelledby']}
				onChange={(e) => onChange(kind === 'count' ? Number(e.target.value) : e.target.value)}
			/>
		) : null;
	},
}));
// The history notice is a Notice; the stand-in keeps its testID, title and action buttons.
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		testID,
		title,
		actions,
	}: {
		testID?: string;
		title: string;
		actions?: { label: string; onPress: () => void; testID?: string; loading?: boolean }[];
	}) => (
		<div data-testid={testID}>
			{title}
			{actions?.map((action) => (
				<button
					key={action.label}
					type="button"
					data-testid={action.testID}
					data-loading={action.loading ? 'true' : 'false'}
					onClick={action.onPress}
				>
					{action.label}
				</button>
			))}
		</div>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, className }: any) => <div className={className}>{children}</div>,
}));
// Records `loading` so a test can read the process button's pending state.
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, loading }: React.PropsWithChildren<{ loading?: boolean }>) => (
		<span data-loading={loading ? 'true' : 'false'}>{children}</span>
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: (props: import('@wcpos/components/dialog').DialogFooterProps) => {
		const Footer = jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter;
		return (
			<div data-testid="modal-footer">
				<Footer
					{...props}
					intent={{
						...props.intent,
						disabled: mockEnableRefundActions ? false : (props.intent || undefined)?.disabled,
					}}
				/>
			</div>
		);
	},
}));
// A ScrollView shows whether it is horizontal, so a test can prove the lines never scroll sideways.
// jsdom lays nothing out (RN-web reads a 0-wide window), so the form renders at a tablet's width
// and a phone test wraps it in `DeviceScope phone`.
jest.mock('react-native', () => {
	const native = jest.requireActual('react-native');
	return {
		...native,
		useWindowDimensions: () => ({ ...native.useWindowDimensions(), width: 1024, height: 768 }),
		ScrollView: ({ children, testID, horizontal, contentContainerStyle }: any) => (
			<div
				data-testid={testID}
				data-horizontal={String(horizontal)}
				data-content-width={contentContainerStyle?.width}
			>
				{children}
			</div>
		),
	};
});
jest.mock('@wcpos/components/table', () => ({
	Table: ({ children }: any) => <table>{children}</table>,
	TableBody: ({ children }: any) => <tbody>{children}</tbody>,
	TableCell: ({ children, className, style }: any) => (
		<td data-classes={className} data-floor={style?.minWidth}>
			{children}
		</td>
	),
	TableHead: ({ children, className, style, accessibilityLabel }: any) => (
		<th data-classes={className} data-floor={style?.minWidth} aria-label={accessibilityLabel}>
			{children}
		</th>
	),
	TableHeader: ({ children }: any) => <thead>{children}</thead>,
	TableRow: ({ children }: any) => <tr>{children}</tr>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, numberOfLines, testID, nativeID, style }: any) => (
		<span
			data-lines={numberOfLines}
			data-testid={testID}
			id={nativeID}
			data-sr-only={style?.position === 'absolute' && style?.width === 1 ? 'true' : undefined}
		>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children }: any) => <label>{children}</label>,
}));
jest.mock('@wcpos/components/segmented-control', () => ({
	SegmentedControl: ({ segments, value, onValueChange }: any) => (
		<div role="radiogroup" data-value={value}>
			{segments.map((segment: any) => (
				<input
					key={segment.value}
					type="radio"
					aria-label={segment.label}
					value={segment.value}
					disabled={segment.disabled}
					data-testid={segment.testID}
					onClick={() => onValueChange(segment.value)}
				/>
			))}
		</div>
	),
}));

jest.mock('observable-hooks', () => {
	const actual = jest.requireActual('observable-hooks');
	return {
		...actual,
		// The store fields under test are BehaviorSubject-like (or absent); a real
		// observable — the degraded-storage latch — goes through the real hook so it
		// stays reactive. Each call site's branch is stable across renders, so hook
		// order is too.
		useObservableEagerState: (observable: any) => {
			if (typeof observable?.getValue === 'function') return observable.getValue();
			if (typeof observable?.subscribe === 'function') {
				return actual.useObservableEagerState(observable);
			}
			return undefined;
		},
	};
});

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useRecordField: (record: any, select: (value: any) => unknown) =>
		select(record?.payload ? record : { payload: record }),
}));

const mockUseRefundMutation = jest.fn(() => jest.fn());
const mockUseRouter = jest.fn(() => ({ back: jest.fn() }));
const mockGet = jest.fn();
const mockHttpClients = new Map<string, { get: (...args: unknown[]) => unknown }>();

jest.mock('./use-refund-mutation', () => ({
	useRefundMutation: () => mockUseRefundMutation(),
}));
jest.mock('expo-router', () => ({ useRouter: () => mockUseRouter() }));
// buildRefundPayload is read from the real mutation module, whose uuid import is ESM.
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: any) =>
		vars?.gateway
			? `${key}:${vars.gateway}`
			: vars?.amount
				? `${key}:${vars.amount}`
				: vars?.price !== undefined
					? `${key}:${vars.price}:${vars.qty}`
					: key,
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
// The real hook memoises its client on the online status (use-rest-http-client/index.ts:408).
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => {
		if (!mockHttpClients.has(mockOnlineStatus)) {
			mockHttpClients.set(mockOnlineStatus, { get: (...args: unknown[]) => mockGet(...args) });
		}
		return mockHttpClients.get(mockOnlineStatus);
	},
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
		mockEnableRefundActions = false;
		mockOnlineStatus = 'online-website-available';
		mockSpacingUnit = 4;
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

		await waitFor(() =>
			expect(screen.getByTestId('refund-order-total').textContent).toBe('common.total€155.00')
		);
		expect(screen.getByTestId('refund-previously-refunded').textContent).toBe(
			'orders.previously_refunded-€10.00'
		);
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

	it('holds Process Refund while gateways load, then defaults the destination from the gateway', async () => {
		let resolveGateways!: (value: unknown) => void;
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') {
				return new Promise((resolve) => {
					resolveGateways = resolve;
				});
			}
			return Promise.resolve({ data: order.refunds, headers: { 'x-wp-totalpages': '1' } });
		});

		render(<RefundOrderForm order={order} />);
		fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value: '45' } });

		// Pending: the destination is unknown, so nothing may be submitted (a cash
		// default here would refund a card sale the wrong way).
		await screen.findByTestId('process-refund-button');
		expect(screen.getByTestId('process-refund-button')).toBeDisabled();
		expect(screen.getByTestId('confirm-process-refund-button')).toBeDisabled();

		await act(async () => {
			resolveGateways({
				data: [
					{
						id: 'stripe_terminal_for_woocommerce',
						capabilities: { supports_provider_refunds: true },
					},
				],
			});
		});

		await waitFor(() => expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled());
		expect(screen.getByRole('radiogroup')).toHaveAttribute('data-value', 'original_method');
	});

	it('does not hold a POS cash refund on the gateway catalog', async () => {
		mockGet.mockImplementation((url: string) =>
			url === 'payment-gateways'
				? new Promise(() => undefined)
				: Promise.resolve({ data: order.refunds, headers: { 'x-wp-totalpages': '1' } })
		);

		render(<RefundOrderForm order={{ ...order, payment_method: 'pos_cash' }} />);
		fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value: '45' } });

		// Cash needs no gateway contract: the confirm action is available while gateways load.
		await waitFor(() => expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled());
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
			expect(screen.getByTestId('refund-previously-refunded').textContent).toBe(
				'orders.previously_refunded-€25.00'
			)
		);
	});

	it('shows the process button loading while the refund save is pending', async () => {
		mockEnableRefundActions = true;
		// Never settles: the save stays pending for the rest of the test.
		const pendingRefund = jest.fn();
		pendingRefund.mockImplementation(() => new Promise<void>(() => {}));
		mockUseRefundMutation.mockReturnValue(pendingRefund);
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') return Promise.resolve({ data: [] });
			return Promise.resolve({
				data: [{ amount: '10.00' }, { amount: '15.00' }],
				headers: { 'x-wp-totalpages': '1' },
			});
		});

		render(<RefundOrderForm order={order} />);
		// The fetched history total proves the refund details have loaded, so the submit is live.
		await waitFor(() =>
			expect(screen.getByTestId('refund-previously-refunded').textContent).toBe(
				'orders.previously_refunded-€25.00'
			)
		);
		fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value: '45' } });
		const processLabel = () =>
			within(screen.getByTestId('process-refund-button')).getByText(/^orders\.submit_refund_/);
		expect(processLabel()).toHaveAttribute('data-loading', 'false');

		fireEvent.click(screen.getByTestId('process-refund-button'));
		fireEvent.click(screen.getByTestId('confirm-process-refund-button'));

		await waitFor(() => expect(pendingRefund).toHaveBeenCalledTimes(1));
		expect(processLabel()).toHaveAttribute('data-loading', 'true');
	});

	it('gives the number columns a floor and lets the product name wrap to two lines', async () => {
		const orderWithLine = {
			...order,
			line_items: [
				{
					id: 77,
					name: 'Aim Analog Watch',
					quantity: 2,
					total: '20.00',
					total_tax: '0.00',
					taxes: [],
				},
			],
		} as never;
		mockGet.mockImplementation((url: string) => {
			if (url === 'payment-gateways') return Promise.resolve({ data: [] });
			return Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '1' } });
		});

		await act(async () => {
			render(<RefundOrderForm order={orderWithLine} />);
		});

		const columns = [
			'min-w-0 flex-[3]',
			'min-w-17 flex-1',
			'min-w-14 flex-1',
			'min-w-21 flex-1',
			'min-w-23 flex-1',
		];
		expect(
			screen.getAllByRole('columnheader').map((head) => head.getAttribute('data-classes'))
		).toEqual(columns.map((column) => `${column} ${HEAD_GROWS}`));
		const row = screen.getAllByRole('row')[1];
		expect(
			within(row)
				.getAllByRole('cell')
				.map((cell) => cell.getAttribute('data-classes'))
		).toEqual(columns);
		expect(screen.getByText('Aim Analog Watch')).toHaveAttribute('data-lines', '2');
	});

	// The table is the wide layout only; a phone shows rows (below).
	describe('the table, wider than a phone', () => {
		async function renderColumns(spacingUnit: number, name = 'Aim Analog Watch') {
			mockSpacingUnit = spacingUnit;
			mockGet.mockImplementation((url: string) => {
				if (url === 'payment-gateways') return Promise.resolve({ data: [] });
				return Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '1' } });
			});
			const lineItem = { id: 77, name, quantity: 2, total: '20.00', taxes: [] };
			await act(async () => {
				render(
					<DeviceScope phone={false}>
						<RefundOrderForm order={{ ...order, line_items: [lineItem] }} />
					</DeviceScope>
				);
			});
			const classes = (nodes: HTMLElement[]) => nodes.map((n) => n.getAttribute('data-classes'));
			return {
				heads: classes(screen.getAllByRole('columnheader')),
				cells: classes(within(screen.getAllByRole('row')[1]).getAllByRole('cell')),
				lines: screen.getByText(name).getAttribute('data-lines'),
			};
		}

		const floorsOf = (nodes: HTMLElement[]) =>
			nodes.map((node) => Number(node.getAttribute('data-floor')));

		it('the floors are set and the table never scrolls sideways', async () => {
			for (const spacingUnit of [3.5, 4, 5]) {
				const { lines } = await renderColumns(spacingUnit);
				const floors = floorsOf(screen.getAllByRole('columnheader'));
				expect(floors).toHaveLength(5);
				floors.forEach((floor) => expect(floor).toBeGreaterThan(0));
				const cellFloors = floorsOf(within(screen.getAllByRole('row')[1]).getAllByRole('cell'));
				expect(cellFloors).toEqual(floors);
				expect(screen.queryByTestId('refund-table-scroll')).not.toBeInTheDocument();
				expect(screen.getByText('Aim Analog Watch')).toBeInTheDocument();
				expect(lines).toBe('2');
				cleanup();
			}
		});

		it('the refund heads use short forms with the full name as their label', async () => {
			await renderColumns(4);
			const [, , , refundQty, refundAmount] = screen.getAllByRole('columnheader');
			expect(refundQty.textContent).toBe('orders.refund_qty_short');
			expect(refundQty).toHaveAttribute('aria-label', 'orders.refund_qty');
			expect(refundAmount.textContent).toBe('orders.refund_amount_short');
			expect(refundAmount).toHaveAttribute('aria-label', 'orders.refund_amount');
		});

		it('the header row grows to fit its heads', async () => {
			await renderColumns(5);
			screen.getAllByRole('columnheader').forEach((head) => {
				const classes = head.getAttribute('data-classes')?.split(' ');
				expect(classes).toEqual(expect.arrayContaining(['h-auto', 'min-h-9', 'py-1']));
				expect(classes).not.toContain('h-9');
			});
		});

		it('the product column is floored at its longest name word', async () => {
			const productFloor = async (name: string) => {
				await renderColumns(3.5, name);
				const [head] = floorsOf(screen.getAllByRole('columnheader'));
				const [cell] = floorsOf(within(screen.getAllByRole('row')[1]).getAllByRole('cell'));
				expect(cell).toBe(head);
				cleanup();
				return head;
			};
			const long = await productFloor('Handgefertigte Keramik-Servierschale');
			const short = await productFloor('Mug');
			expect(long).toBeGreaterThan(20 * 3.5);
			expect(long).toBeGreaterThan(short);
		});

		it('Compact: the columns keep their classes and the name keeps two lines', async () => {
			const floored = [
				'min-w-0 flex-[3]',
				'min-w-17 flex-1',
				'min-w-14 flex-1',
				'min-w-21 flex-1',
				'min-w-23 flex-1',
			];
			expect(await renderColumns(3.5)).toEqual({
				heads: floored.map((column) => `${column} ${HEAD_GROWS}`),
				cells: floored,
				lines: '2',
			});
		});
	});

	describe('on a phone', () => {
		const lines = [
			{ id: 71, name: 'Aim Analog Watch', quantity: 2, total: '20.00', taxes: [] },
			{ id: 72, name: 'Belt', quantity: 1, total: '9.00', taxes: [] },
			{
				id: 73,
				name: 'Handgefertigte Keramik-Servierschale mit Goldrand',
				quantity: 3,
				total: '36.00',
				taxes: [],
			},
		];
		async function renderPhone(spacingUnit = 4) {
			mockSpacingUnit = spacingUnit;
			mockGet.mockImplementation((url: string) => {
				if (url === 'payment-gateways') return Promise.resolve({ data: [] });
				return Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '1' } });
			});
			await act(async () => {
				render(
					<DeviceScope phone>
						<RefundOrderForm order={{ ...order, line_items: lines }} />
					</DeviceScope>
				);
			});
		}

		it('two-line rows with no column heads', async () => {
			await renderPhone();
			const rows = screen.getAllByTestId('refund-line-row');
			expect(rows).toHaveLength(3);
			expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
			for (const head of [
				'common.product',
				'common.price',
				'pos_cart.qty_abbrev',
				'orders.refund_qty_short',
				'orders.refund_amount_short',
			]) {
				expect(screen.queryByText(head)).not.toBeInTheDocument();
			}
			const expected = [
				['Aim Analog Watch', '10.00', '2'],
				['Belt', '9.00', '1'],
				['Handgefertigte Keramik-Servierschale mit Goldrand', '12.00', '3'],
			];
			rows.forEach((row, index) => {
				const [name, price, qty] = expected[index];
				expect(within(row).getByText(name)).toBeInTheDocument();
				expect(within(row).getByTestId('refund-line-price-qty')).toHaveTextContent(
					`orders.refund_line_price_qty:${price}:${qty}`
				);
				// Each value carries a hidden label for screen readers; the input is named by its own.
				const [qtyLabel, amountLabel] = within(row)
					.getAllByText(/^orders\.refund_(qty|amount)$/)
					.map((label) => {
						expect(label).toHaveAttribute('data-sr-only', 'true');
						return label;
					});
				expect(qtyLabel).toHaveTextContent('orders.refund_qty');
				expect(qtyLabel.id).toBe(`refund-qty-label-${index}`);
				expect(within(row).getByTestId(`line_items.${index}.refund_qty`)).toHaveAttribute(
					'aria-labelledby',
					qtyLabel.id
				);
				expect(amountLabel).toHaveTextContent('orders.refund_amount');
				const amountText = within(row).getByTestId('refund-line-amount');
				expect(amountText).toHaveTextContent(/^0\.00$/);
				expect(amountText).toHaveAttribute('data-lines', '1');
			});
			// Entering a quantity updates that row's amount.
			fireEvent.change(screen.getByTestId('line_items.1.refund_qty'), { target: { value: '1' } });
			await waitFor(() =>
				expect(within(rows[1]).getByTestId('refund-line-amount')).toHaveTextContent('9.00')
			);
		});

		it('no sideways scroll at any scale', async () => {
			for (const spacingUnit of [3.5, 4, 5]) {
				await renderPhone(spacingUnit);
				expect(screen.getAllByTestId('refund-line-row')).toHaveLength(3);
				expect(screen.queryByTestId('refund-table-scroll')).not.toBeInTheDocument();
				expect(document.querySelector('[data-horizontal="true"]')).toBeNull();
				cleanup();
			}
		});

		it('the name is not clamped', async () => {
			await renderPhone();
			const name = screen.getByText('Handgefertigte Keramik-Servierschale mit Goldrand');
			expect(name).not.toHaveAttribute('data-lines');
		});
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

	it('renders refund actions in the modal footer, outside the scrolling body', async () => {
		mockGet.mockResolvedValue({
			data: order.refunds,
			headers: { 'x-wp-totalpages': '1' },
		});

		render(<RefundOrderForm order={order} />);

		const processButton = await screen.findByTestId('process-refund-button');
		expect(processButton.parentElement).toBe(screen.getByTestId('modal-footer'));
	});

	describe('submit line', () => {
		const cashOrder = { ...order, payment_method: 'pos_cash' } as never;
		const mockRefundCall = jest.fn(() => new Promise<void>(() => {}));

		function mockGateways(gateways: Promise<unknown>) {
			mockGet.mockImplementation((url: string) =>
				url === 'payment-gateways'
					? gateways
					: Promise.resolve({ data: order.refunds, headers: { 'x-wp-totalpages': '1' } })
			);
		}
		const supportedGateway = {
			data: [{ id: order.payment_method, capabilities: { supports_provider_refunds: true } }],
		};
		const processButton = () => screen.getByTestId('process-refund-button');
		const labelReads = (text: string) =>
			waitFor(() => expect(processButton()).toHaveTextContent(text));
		const enterAmount = (value: string) =>
			fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value } });

		beforeEach(() => {
			mockUseRefundMutation.mockReturnValue(mockRefundCall);
		});

		it('names the cash destination on the submit button', async () => {
			mockGateways(Promise.resolve({ data: [] }));
			render(<RefundOrderForm order={cashOrder} />);
			enterAmount('45');
			await labelReads('orders.submit_refund_cash:€45.00');
		});

		it('names the original method on the submit button and follows the destination control', async () => {
			mockGateways(Promise.resolve(supportedGateway));
			render(<RefundOrderForm order={order} />);
			await waitFor(() =>
				expect(screen.getByRole('radiogroup')).toHaveAttribute('data-value', 'original_method')
			);
			enterAmount('45');
			await labelReads('orders.submit_refund_original:€45.00');

			fireEvent.click(screen.getByTestId('refund-destination-cash'));
			await labelReads('orders.submit_refund_cash:€45.00');

			fireEvent.click(processButton());
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));
			await waitFor(() =>
				expect(mockRefundCall).toHaveBeenCalledWith(
					expect.objectContaining({ refundDestination: 'cash' })
				)
			);
		});

		describe('#3651: money recorded by hand against the gateway', () => {
			// prettier-ignore
			const leg = (id: string, overrides: Record<string, unknown> = {}) => ({
				id, source: 'app', order_id: order.id, method_id: order.payment_method, provider: null,
				kind: 'card', capture_mode: 'manual', transport: null, recorded_offline: false,
				amount: '50.00', currency: 'EUR', tendered: null, change: null, tip: null,
				status: 'captured', failure_reason: null, refunded_amount: '0.00', refunds: [],
				provider_refs: {}, receipt: {}, cashier_id: 1, store_id: null, events: [],
				created_at_gmt: '', captured_at_gmt: '', updated_at_gmt: '', ...overrides,
			});
			const corrected = leg('cash-leg', { method_id: 'pos_cash', kind: 'cash' });
			const minus = leg('r-minus', {
				method_id: 'pos_cash',
				amount: '-50.00',
				entry: 'tender_correction',
				reverses: 'cash-leg',
			});
			const unverified = leg('r-plus', {
				entry: 'tender_correction',
				corrects: 'cash-leg',
				unverified: true,
			});
			const withLedger = (payments: unknown[]) => ({
				...order,
				meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments } }],
			});
			const original = () => screen.getByTestId('refund-destination-original_method');
			const destination = () => screen.getByRole('radiogroup');

			async function submitsCash() {
				await waitFor(() => expect(destination()).toHaveAttribute('data-value', 'cash'));
				expect(original()).toBeDisabled();
				expect(screen.getByText('orders.original_method_refund_unavailable')).toBeInTheDocument();
				enterAmount('20');
				await labelReads('orders.submit_refund_cash:€20.00');
				fireEvent.click(processButton());
				fireEvent.click(screen.getByTestId('confirm-process-refund-button'));
				await waitFor(() =>
					expect(mockRefundCall).toHaveBeenCalledWith(
						expect.objectContaining({ refundDestination: 'cash' })
					)
				);
			}

			it('an unverified R+ disables the original method and the refund goes to cash', async () => {
				mockGateways(Promise.resolve(supportedGateway));
				render(<RefundOrderForm order={withLedger([corrected, minus, unverified])} />);
				await submitsCash();
			});

			it('the same on a mixed sale with a verified provider leg', async () => {
				mockGateways(Promise.resolve(supportedGateway));
				const verified = leg('stripe-leg', { provider: 'stripe', capture_mode: 'terminal' });
				render(<RefundOrderForm order={withLedger([verified, corrected, minus, unverified])} />);
				await submitsCash();
			});

			it('a reversed unverified row leaves the original method the default', async () => {
				mockGateways(Promise.resolve(supportedGateway));
				const reversal = leg('r-minus-2', {
					amount: '-50.00',
					entry: 'tender_correction',
					reverses: 'r-plus',
				});
				const cheque = leg('r-plus-2', {
					method_id: 'pos_cheque',
					entry: 'tender_correction',
					corrects: 'r-plus',
				});
				render(
					<RefundOrderForm order={withLedger([corrected, minus, unverified, reversal, cheque])} />
				);
				await waitFor(() => expect(destination()).toHaveAttribute('data-value', 'original_method'));
				expect(original()).toBeEnabled();
				expect(screen.queryByText('orders.original_method_refund_unavailable')).toBeNull();
			});

			it('a choice of the original method made before the row arrives becomes cash', async () => {
				mockGateways(Promise.resolve(supportedGateway));
				const { rerender } = render(<RefundOrderForm order={withLedger([corrected])} />);
				await waitFor(() => expect(original()).toBeEnabled());
				fireEvent.click(screen.getByTestId('refund-destination-cash'));
				fireEvent.click(original());
				await waitFor(() => expect(destination()).toHaveAttribute('data-value', 'original_method'));
				rerender(<RefundOrderForm order={withLedger([corrected, minus, unverified])} />);
				await submitsCash();
			});
		});

		it('keeps Process Refund until there is an amount', async () => {
			mockGateways(Promise.resolve({ data: [] }));
			render(<RefundOrderForm order={cashOrder} />);
			await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
			expect(processButton()).toHaveTextContent('orders.process_refund');
		});

		it('keeps Process Refund while the destination is unknown', async () => {
			let resolveGateways!: (value: unknown) => void;
			mockGateways(new Promise((resolve) => (resolveGateways = resolve)));
			render(<RefundOrderForm order={order} />);
			enterAmount('45');
			await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

			expect(processButton()).toHaveTextContent('orders.process_refund');

			await act(async () => resolveGateways(supportedGateway));
			await labelReads('orders.submit_refund_original:€45.00');
		});

		it.each([
			['disables the submit button offline and says why in place', 'offline'],
			['treats an unreachable store as no connection', 'online-website-unavailable'],
		])('%s', async (_name, status) => {
			mockOnlineStatus = status;
			mockGateways(Promise.resolve({ data: [] }));
			render(<RefundOrderForm order={cashOrder} />);
			enterAmount('45');

			await labelReads('orders.submit_refund_cash:€45.00');
			expect(processButton()).toBeDisabled();
			// The Text mock drops testID, so the reason line is found by its text.
			expect(screen.getByText('orders.refund_needs_connection')).toBeInTheDocument();
		});

		it('shows no reason and enables the button online', async () => {
			mockGateways(Promise.resolve({ data: [] }));
			render(<RefundOrderForm order={cashOrder} />);
			enterAmount('45');
			await waitFor(() => expect(processButton()).toBeEnabled());
			expect(screen.queryByText('orders.refund_needs_connection')).not.toBeInTheDocument();
		});

		it('sends nothing when the link drops with the confirm dialog open', async () => {
			mockGateways(Promise.resolve({ data: [] }));
			const { rerender } = render(<RefundOrderForm order={cashOrder} />);
			enterAmount('45');
			await waitFor(() => expect(processButton()).toBeEnabled());

			fireEvent.click(processButton());
			expect(screen.getByTestId('refund-confirm-dialog')).toHaveAttribute('data-open', 'true');

			mockOnlineStatus = 'offline';
			rerender(<RefundOrderForm order={cashOrder} />);
			await waitFor(() =>
				expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled()
			);
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));

			await waitFor(() =>
				expect(screen.getByTestId('refund-confirm-dialog')).toHaveAttribute('data-open', 'false')
			);
			expect(mockRefundCall).not.toHaveBeenCalled();
		});

		it('sends nothing when the confirm is pressed with nothing to refund', async () => {
			mockEnableRefundActions = true;
			mockGateways(Promise.resolve({ data: [] }));
			render(<RefundOrderForm order={cashOrder} />);

			enterAmount('45');
			await labelReads('orders.submit_refund_cash:€45.00');
			enterAmount('');
			await labelReads('orders.process_refund');

			fireEvent.click(processButton());
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));

			await waitFor(() =>
				expect(screen.getByTestId('refund-confirm-dialog')).toHaveAttribute('data-open', 'false')
			);
			expect(mockRefundCall).not.toHaveBeenCalled();
		});

		it.each([
			['hides the lookup-failed line offline', 'offline', false],
			['keeps the lookup-failed line online', 'online-website-available', true],
		])('%s', async (_name, status, shown) => {
			mockOnlineStatus = status;
			mockGet.mockRejectedValue(new Error('boom'));
			render(<RefundOrderForm order={order} />);
			enterAmount('45');

			// The confirm action ignores the connection; it frees once the failed lookup settles and
			// an amount is entered.
			await waitFor(() =>
				expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled()
			);
			const line = screen.queryByText('orders.original_method_refund_lookup_failed');
			const reason = screen.queryByText('orders.refund_needs_connection');
			if (shown) {
				expect(line).toBeInTheDocument();
			} else {
				expect(line).not.toBeInTheDocument();
				expect(reason).toBeInTheDocument();
			}
		});

		it('gives the button back when the connection returns', async () => {
			mockOnlineStatus = 'offline';
			mockGateways(Promise.resolve({ data: [] }));
			const { rerender } = render(<RefundOrderForm order={cashOrder} />);
			enterAmount('45');
			await labelReads('orders.submit_refund_cash:€45.00');
			expect(processButton()).toBeDisabled();
			expect(screen.getByText('orders.refund_needs_connection')).toBeInTheDocument();

			mockOnlineStatus = 'online-website-available';
			rerender(<RefundOrderForm order={cashOrder} />);
			await waitFor(() => expect(processButton()).toBeEnabled());
			expect(screen.queryByText('orders.refund_needs_connection')).not.toBeInTheDocument();

			fireEvent.click(processButton());
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));
			await waitFor(() => expect(mockRefundCall).toHaveBeenCalledTimes(1));
		});

		it('keeps the line quantities when the connection drops and returns with the confirm open', async () => {
			const lineOrder = {
				...order,
				payment_method: 'pos_cash',
				refunds: [],
				line_items: [
					{ id: 77, name: 'Belt', quantity: 2, total: '20.00', total_tax: '0.00', taxes: [] },
				],
			} as never;
			mockGet.mockImplementation((url: string) => {
				if (url === 'payment-gateways') return Promise.resolve({ data: [] });
				if (mockOnlineStatus !== 'online-website-available') {
					return Promise.reject(new Error('offline'));
				}
				return Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '1' } });
			});

			const { rerender } = render(<RefundOrderForm order={lineOrder} />);
			await waitFor(() => {
				const row = screen.getByText('Belt').closest('tr') as HTMLElement;
				expect(within(row).getByText('2')).toBeInTheDocument();
			});

			fireEvent.change(screen.getByTestId('line_items.0.refund_qty'), { target: { value: '1' } });
			await labelReads('orders.submit_refund_cash:€10.00');

			fireEvent.click(processButton());
			expect(screen.getByTestId('refund-confirm-dialog')).toHaveAttribute('data-open', 'true');

			mockOnlineStatus = 'offline';
			rerender(<RefundOrderForm order={lineOrder} />);
			mockOnlineStatus = 'online-website-available';
			rerender(<RefundOrderForm order={lineOrder} />);

			await waitFor(() =>
				expect(
					mockGet.mock.calls.filter(([url]) => url === 'orders/23858/refunds').length
				).toBeGreaterThanOrEqual(3)
			);
			await labelReads('orders.submit_refund_cash:€10.00');
			expect(screen.getByText('orders.confirm_refund_description:€10.00')).toBeInTheDocument();

			await waitFor(() =>
				expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled()
			);
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));
			await waitFor(() =>
				expect(mockRefundCall).toHaveBeenCalledWith(
					expect.objectContaining({
						amount: '10.00',
						lineItems: [expect.objectContaining({ id: 77, quantity: 1 })],
					})
				)
			);
		});

		it('keeps the remaining quantities read from the store when a reload fails offline', async () => {
			const lineOrder = {
				...order,
				payment_method: 'pos_cash',
				refunds: [{ id: 5, total: '-10.00' }],
				line_items: [
					{ id: 77, name: 'Belt', quantity: 2, total: '20.00', total_tax: '0.00', taxes: [] },
				],
			} as never;
			mockGet.mockImplementation((url: string) => {
				if (url === 'payment-gateways') return Promise.resolve({ data: [] });
				if (mockOnlineStatus !== 'online-website-available') {
					return Promise.reject(new Error('offline'));
				}
				return Promise.resolve({
					data: [{ id: 5, total: '-10.00', line_items: [{ id: 77, quantity: 1 }] }],
					headers: { 'x-wp-totalpages': '1' },
				});
			});

			const { rerender } = render(<RefundOrderForm order={lineOrder} />);
			await waitFor(() => {
				const row = screen.getByText('Belt').closest('tr') as HTMLElement;
				expect(within(row).getByText('1')).toBeInTheDocument();
			});

			mockOnlineStatus = 'offline';
			rerender(<RefundOrderForm order={lineOrder} />);
			await waitFor(() =>
				expect(
					mockGet.mock.calls.filter(([url]) => url === 'orders/23858/refunds').length
				).toBeGreaterThanOrEqual(2)
			);
			await waitFor(() => {
				const row = screen.getByText('Belt').closest('tr') as HTMLElement;
				expect(within(row).getByText('1')).toBeInTheDocument();
			});
			const row = screen.getByText('Belt').closest('tr') as HTMLElement;
			expect(within(row).queryByText('2')).toBeNull();
		});

		it('disables the confirm when the refund falls to nothing while it is open', async () => {
			mockGateways(Promise.resolve({ data: [] }));
			render(<RefundOrderForm order={cashOrder} />);

			enterAmount('45');
			await waitFor(() => expect(processButton()).toBeEnabled());
			fireEvent.click(processButton());
			expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled();

			enterAmount('');
			await waitFor(() =>
				expect(screen.getByTestId('confirm-process-refund-button')).toBeDisabled()
			);
			expect(screen.getByText('orders.confirm_refund_description:€0.00')).toBeInTheDocument();
		});
	});

	// #3380: a 2xx with no refund in it must not tell the cashier the refund went through.
	describe('the answer to a sent refund', () => {
		const cashOrder = { ...order, payment_method: 'pos_cash' } as never;
		const back = jest.fn();
		// jest.config maps the logger to a mock whose getLogger hands every caller one shared logger.
		const { success, warn, error } = getLogger(['wcpos', 'mutations', 'refund']) as unknown as {
			success: jest.Mock;
			warn: jest.Mock;
			error: jest.Mock;
		};

		beforeEach(() => {
			mockUseRouter.mockImplementation(() => ({ back }));
			mockGet.mockImplementation((url: string) =>
				url === 'payment-gateways'
					? Promise.resolve({ data: [] })
					: Promise.resolve({ data: order.refunds, headers: { 'x-wp-totalpages': '1' } })
			);
		});

		afterEach(() => {
			mockUseRouter.mockImplementation(() => ({ back: jest.fn() }));
		});

		async function sendRefund(refundCall: jest.Mock) {
			mockUseRefundMutation.mockReturnValue(refundCall);
			render(<RefundOrderForm order={cashOrder} />);
			fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value: '5' } });
			await waitFor(() => expect(screen.getByTestId('process-refund-button')).toBeEnabled());
			fireEvent.click(screen.getByTestId('process-refund-button'));
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));
			await waitFor(() => expect(refundCall).toHaveBeenCalledTimes(1));
		}

		it('an unconfirmed refund logs an error, logs no success and stays on the form', async () => {
			await sendRefund(jest.fn().mockRejectedValue(new RefundUnconfirmedError(23858, 200)));

			await waitFor(() => expect(error).toHaveBeenCalledWith('Refund failed', expect.anything()));
			expect(error).toHaveBeenCalledWith('Refund failed', {
				showToast: true,
				toast: {
					title: 'orders.refund_unconfirmed',
					text2: 'orders.refund_unconfirmed_check',
				},
				context: {
					orderId: 23858,
					status: 200,
					error: 'Refund not confirmed: order 23858, status 200',
				},
				code: 'PAYMENT311',
			});
			expect(success).not.toHaveBeenCalled();
			// The logger mock is shared by every module, so only this form's failure row is checked.
			expect(warn).not.toHaveBeenCalledWith('Refund failed', expect.anything());
			expect(back).not.toHaveBeenCalled();
		});

		it('a lost refund record logs PAYMENT312, logs no success and closes the form', async () => {
			const failure = Object.assign(new Error('500'), {
				response: {
					status: 500,
					data: { code: 'wcpos_refund_record_lost', message: 'x', data: { status: 500 } },
				},
			});
			await sendRefund(jest.fn().mockRejectedValue(failure));

			await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
			expect(error).toHaveBeenCalledWith(
				'Refund failed',
				expect.objectContaining({
					showToast: true,
					toast: {
						title: 'orders.refund_record_lost',
						text2: 'orders.refund_record_lost_check',
					},
					code: 'PAYMENT312',
				})
			);
			expect(success).not.toHaveBeenCalled();
		});

		it('a refund refused for a hand-recorded payment warns with its own line and keeps the form', async () => {
			const failure = Object.assign(new Error('409'), {
				response: {
					status: 409,
					data: {
						code: 'wcpos_refund_unverified_payment',
						message: 'x',
						data: { status: 409, reason: 'unverified', payment_id: '17' },
					},
				},
			});
			await sendRefund(jest.fn().mockRejectedValue(failure));

			await waitFor(() =>
				expect(warn).toHaveBeenCalledWith(
					'Refund failed',
					expect.objectContaining({
						showToast: true,
						toast: {
							title: 'orders.refund_unverified_payment',
							text2: 'orders.refund_unverified_payment_check',
						},
						code: 'SYNC211',
					})
				)
			);
			expect(back).not.toHaveBeenCalled();
			expect(success).not.toHaveBeenCalled();
			expect(screen.getByTestId('refund-custom-amount')).toHaveValue('5');
		});

		it('another server error logs PAYMENT311 and stays on the form', async () => {
			const failure = Object.assign(new Error('500'), {
				response: { status: 500, data: { code: 'internal_server_error' } },
			});
			await sendRefund(jest.fn().mockRejectedValue(failure));

			await waitFor(() => expect(error).toHaveBeenCalledWith('Refund failed', expect.anything()));
			expect(error).toHaveBeenCalledWith(
				'Refund failed',
				expect.objectContaining({
					toast: {
						title: 'orders.refund_outcome_unknown',
						text2: 'orders.refund_check_before_retry',
					},
					code: 'PAYMENT311',
				})
			);
			expect(back).not.toHaveBeenCalled();
		});

		it('a genuine refund logs its success and goes back, as before', async () => {
			await sendRefund(jest.fn().mockResolvedValue({ id: 230987, amount: '5.00' }));

			await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
			expect(success).toHaveBeenCalledWith(
				'orders.refund_processed:5.00',
				expect.objectContaining({ showToast: true })
			);
			expect(warn).not.toHaveBeenCalledWith('Refund failed', expect.anything());
		});
	});

	describe('when the refund history does not load online', () => {
		const { buildRefundPayload } =
			jest.requireActual<typeof import('./use-refund-mutation')>('./use-refund-mutation');
		const mockRefundCall = jest.fn((_args: any) => new Promise<void>(() => {}));
		const refundsUrl = 'orders/23858/refunds';
		// One line of 3 at €20, €200 total, one earlier refund of €20: €180 may still be refunded.
		const lockedOrder = {
			...order,
			total: '200.00',
			refunds: [{ id: 9, total: '-20.00' }],
			line_items: [
				{ id: 77, name: 'Watch', quantity: 3, total: '60.00', total_tax: '0.00', taxes: [] },
			],
		} as any;
		const historyRow = { id: 9, total: '-20.00', line_items: [{ id: 77, quantity: -1 }] };

		// The gateway lookup resolves; each refunds GET takes the next answer, the last one repeating.
		function mockRefundsGets(...answers: (() => Promise<unknown>)[]) {
			let call = 0;
			mockGet.mockImplementation((url: string) => {
				if (url === 'payment-gateways') return Promise.resolve({ data: [] });
				return answers[Math.min(call++, answers.length - 1)]();
			});
		}
		const storeError = () => Promise.reject(new Error('store error'));
		const qtyCell = () =>
			screen.getByText('Watch').closest('tr')?.querySelectorAll('td')[2] as HTMLElement;
		const qtyField = () => screen.getByTestId('line_items.0.refund_qty');
		const processButton = () => screen.getByTestId('process-refund-button');
		const enterAmount = (value: string) =>
			fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value } });
		const refundsGets = () => mockGet.mock.calls.filter(([url]) => url === refundsUrl).length;

		beforeEach(() => {
			mockUseRefundMutation.mockReturnValue(mockRefundCall);
		});

		it('locks the lines and refunds only an amount', async () => {
			let failHistory!: (error: Error) => void;
			mockRefundsGets(() => new Promise((_resolve, reject) => (failHistory = reject)));
			render(<RefundOrderForm order={lockedOrder} />);
			// A quantity entered while the history loads is cleared once the lines lock.
			fireEvent.change(qtyField(), { target: { value: '1' } });
			await act(async () => failHistory(new Error('store error')));

			expect(await screen.findByTestId('refund-history-missing')).toHaveTextContent(
				'orders.refund_history_not_loaded'
			);
			expect(qtyCell()).toHaveTextContent('–');
			expect(qtyField()).toBeDisabled();

			enterAmount('45');
			await waitFor(() => expect(processButton()).toBeEnabled());
			fireEvent.click(processButton());
			fireEvent.click(screen.getByTestId('confirm-process-refund-button'));

			await waitFor(() => expect(mockRefundCall).toHaveBeenCalledTimes(1));
			const args = mockRefundCall.mock.calls[0][0];
			expect(args).toEqual(expect.objectContaining({ amount: '45.00', lineItems: [] }));
			const payload = buildRefundPayload(args);
			expect(payload).toEqual(expect.objectContaining({ amount: '45.00' }));
			expect(payload).not.toHaveProperty('line_items');
		});

		it('phone: a locked line shows – as its quantity and disables the input', async () => {
			mockRefundsGets(storeError);
			render(
				<DeviceScope phone>
					<RefundOrderForm order={lockedOrder} />
				</DeviceScope>
			);
			await screen.findByTestId('refund-history-missing');
			const row = screen.getByTestId('refund-line-row');
			expect(within(row).getByTestId('refund-line-price-qty')).toHaveTextContent(/:–$/);
			expect(within(row).getByTestId('line_items.0.refund_qty')).toBeDisabled();
		});

		it('the cap still holds while the lines are locked', async () => {
			mockRefundsGets(storeError);
			render(<RefundOrderForm order={lockedOrder} />);
			await screen.findByTestId('refund-history-missing');

			// 180 first, so the 181 refusal below is the cap and not a lookup still settling.
			enterAmount('180');
			await waitFor(() => expect(processButton()).toBeEnabled());

			enterAmount('181');
			await waitFor(() => expect(processButton()).toBeDisabled());

			enterAmount('180');
			await waitFor(() => expect(processButton()).toBeEnabled());
		});

		it('Retry unlocks the lines with the right quantities', async () => {
			mockRefundsGets(storeError, () =>
				Promise.resolve({ data: [historyRow], headers: { 'x-wp-totalpages': '1' } })
			);
			render(<RefundOrderForm order={lockedOrder} />);
			await screen.findByTestId('refund-history-missing');

			fireEvent.click(screen.getByTestId('refund-history-retry'));

			await waitFor(() =>
				expect(screen.queryByTestId('refund-history-missing')).not.toBeInTheDocument()
			);
			// The rows follow the form's reset, one render after the notice goes.
			await waitFor(() => expect(qtyCell()).toHaveTextContent('2'));
			expect(qtyField()).toBeEnabled();
		});

		it('a failed Retry keeps the lines locked', async () => {
			mockRefundsGets(storeError);
			render(<RefundOrderForm order={lockedOrder} />);
			await screen.findByTestId('refund-history-missing');

			fireEvent.click(screen.getByTestId('refund-history-retry'));

			await waitFor(() => expect(refundsGets()).toBe(2));
			await waitFor(() =>
				expect(screen.getByTestId('refund-history-retry')).toHaveAttribute('data-loading', 'false')
			);
			expect(screen.getByTestId('refund-history-missing')).toBeInTheDocument();
			expect(qtyField()).toBeDisabled();
		});

		it('a refund synced in before a failed reload locks the lines', async () => {
			mockRefundsGets(
				() => Promise.resolve({ data: [historyRow], headers: { 'x-wp-totalpages': '1' } }),
				storeError
			);
			const { rerender } = render(<RefundOrderForm order={lockedOrder} />);
			await waitFor(() => expect(qtyCell()).toHaveTextContent('2'));

			const synced = {
				...lockedOrder,
				refunds: [...lockedOrder.refunds, { id: 10, total: '-20.00' }],
			};
			rerender(<RefundOrderForm order={synced} />);

			expect(await screen.findByTestId('refund-history-missing')).toBeInTheDocument();
			expect(qtyField()).toBeDisabled();
			expect(screen.getByTestId('refund-previously-refunded').textContent).toBe(
				'orders.previously_refunded-€40.00'
			);
		});

		it('a synced order holding the same refunds keeps the history read', async () => {
			mockRefundsGets(
				() => Promise.resolve({ data: [historyRow], headers: { 'x-wp-totalpages': '1' } }),
				storeError
			);
			const { rerender } = render(<RefundOrderForm order={lockedOrder} />);
			await waitFor(() => expect(qtyCell()).toHaveTextContent('2'));

			rerender(
				<RefundOrderForm
					order={{ ...lockedOrder, refunds: [{ id: 9, total: '-20.00', reason: 'Damaged' }] }}
				/>
			);
			await waitFor(() => expect(refundsGets()).toBe(2));
			await waitFor(() => expect(qtyCell()).toHaveTextContent('2'));
			expect(screen.queryByTestId('refund-history-missing')).not.toBeInTheDocument();
			expect(qtyField()).toBeEnabled();
		});

		it('a refund gone from the synced order before a failed reload locks the lines', async () => {
			const secondRefund = { id: 10, total: '-20.00' };
			const bothRefunds = { ...lockedOrder, refunds: [...lockedOrder.refunds, secondRefund] };
			mockRefundsGets(
				() =>
					Promise.resolve({
						data: [historyRow, { ...secondRefund, line_items: [{ id: 77, quantity: -1 }] }],
						headers: { 'x-wp-totalpages': '1' },
					}),
				storeError
			);
			const { rerender } = render(<RefundOrderForm order={bothRefunds} />);
			await waitFor(() => expect(qtyCell()).toHaveTextContent('1'));

			// Refund 10 was deleted in WooCommerce admin; the synced order lists only refund 9.
			rerender(<RefundOrderForm order={lockedOrder} />);

			expect(await screen.findByTestId('refund-history-missing')).toBeInTheDocument();
			expect(screen.getByTestId('refund-history-retry')).toBeInTheDocument();
			expect(qtyField()).toBeDisabled();
			expect(screen.getByTestId('refund-previously-refunded').textContent).toBe(
				'orders.previously_refunded-€20.00'
			);
		});

		it('a refund synced then deleted across two failed reloads after an empty history is not kept', async () => {
			const noRefunds = { ...lockedOrder, refunds: [] };
			mockRefundsGets(
				() => Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '1' } }),
				storeError,
				storeError
			);
			const { rerender } = render(<RefundOrderForm order={noRefunds} />);
			await waitFor(() => expect(qtyCell()).toHaveTextContent('3'));

			rerender(
				<RefundOrderForm order={{ ...noRefunds, refunds: [{ id: 10, total: '-20.00' }] }} />
			);
			await screen.findByTestId('refund-history-missing');

			rerender(<RefundOrderForm order={noRefunds} />);
			await waitFor(() => expect(refundsGets()).toBe(3));
			// €0.00 previously refunded: the form hides the row rather than show €20.00 for refund 10.
			await waitFor(() =>
				expect(screen.queryByTestId('refund-previously-refunded')).not.toBeInTheDocument()
			);
		});

		it('no saved refunds: the lines still lock', async () => {
			mockRefundsGets(storeError);
			render(<RefundOrderForm order={{ ...lockedOrder, refunds: [] }} />);

			expect(await screen.findByTestId('refund-history-missing')).toBeInTheDocument();
			expect(qtyCell()).toHaveTextContent('–');
			expect(qtyField()).toBeDisabled();
		});

		it('the history loads empty: no notice and the full quantity', async () => {
			mockRefundsGets(() => Promise.resolve({ data: [], headers: { 'x-wp-totalpages': '1' } }));
			render(<RefundOrderForm order={{ ...lockedOrder, refunds: [] }} />);

			await waitFor(() => expect(qtyCell()).toHaveTextContent('3'));
			expect(screen.queryByTestId('refund-history-missing')).not.toBeInTheDocument();
			expect(qtyField()).toBeEnabled();
		});

		it('offline is unchanged', async () => {
			mockOnlineStatus = 'offline';
			mockRefundsGets(storeError);
			render(<RefundOrderForm order={lockedOrder} />);

			await waitFor(() => expect(qtyCell()).toHaveTextContent('3'));
			expect(screen.queryByTestId('refund-history-missing')).not.toBeInTheDocument();
		});
	});
});

/**
 * #163 follow-up ruling: refunds are a money path. Both the rendered disabled
 * state and the submit handler must refuse, because the latch can fire between
 * opening the confirm dialog and pressing it.
 */
describe('RefundOrderForm while storage is degraded', () => {
	const mockRefundCall = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		mockOnlineStatus = 'online-website-available';
		mockUseRefundMutation.mockReturnValue(mockRefundCall);
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
	});

	afterEach(() => {
		act(() => clearStorageDegradation());
	});

	async function killStorageWorker() {
		const instance = {
			schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
			findDocumentsById: jest.fn(),
			bulkWrite: jest
				.fn()
				.mockRejectedValue(
					new Error(
						'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
					)
				),
			query: jest.fn(),
			count: jest.fn(),
			getAttachmentData: jest.fn(),
			getChangedDocumentsSince: jest.fn(),
			changeStream: jest.fn(),
			cleanup: jest.fn(),
			close: jest.fn().mockResolvedValue(undefined),
			remove: jest.fn(),
			collectionName: 'orders',
			databaseName: 'degraded-refund-form',
			internals: {},
			options: {},
		};
		const wrapped = await wrappedErrorHandlerStorage({
			storage: {
				name: 'mock-storage',
				rxdbVersion: '17.4.0',
				createStorageInstance: jest.fn().mockResolvedValue(instance),
			} as never,
		}).createStorageInstance({ databaseName: 'degraded-refund-form' } as never);

		await expect(wrapped.bulkWrite([{ document: { id: '1' } }] as never, 'test')).rejects.toThrow();
	}

	it('disables both refund actions', async () => {
		render(<RefundOrderForm order={order} />);
		await screen.findByTestId('process-refund-button');
		fireEvent.change(screen.getByTestId('refund-custom-amount'), { target: { value: '45' } });

		// Prove the healthy starting state first: without this, an initially-disabled
		// control would satisfy the post-degradation `toBeDisabled` without the
		// storage latch ever changing the UI. An amount is entered so that both
		// actions start enabled (each folds in `!isValid`, which holds before any
		// amount is entered).
		await waitFor(() => expect(screen.getByTestId('confirm-process-refund-button')).toBeEnabled());

		await killStorageWorker();

		// The latch emission re-renders the form; waitFor lets that settle without
		// an async act() that would also block on the form's in-flight refund fetch.
		await waitFor(() => expect(screen.getByTestId('process-refund-button')).toBeDisabled());
		expect(screen.getByTestId('confirm-process-refund-button')).toBeDisabled();
	});

	it('refuses the submit when storage degrades after confirmation opens', async () => {
		mockEnableRefundActions = true;
		render(<RefundOrderForm order={order} />);
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
		// The gateway lookup holds the button (loading) until it settles; the click must land after.
		await waitFor(() => expect(screen.getByTestId('process-refund-button')).toBeEnabled());

		fireEvent.click(screen.getByTestId('process-refund-button'));
		expect(screen.getByTestId('refund-confirm-dialog')).toHaveAttribute('data-open', 'true');

		await killStorageWorker();

		// The handler refuses too: `disabled` cannot cover a latch that fires while
		// the confirm dialog is already open.
		fireEvent.click(screen.getByTestId('confirm-process-refund-button'));

		await waitFor(() =>
			expect(screen.getByTestId('refund-confirm-dialog')).toHaveAttribute('data-open', 'false')
		);
		expect(mockRefundCall).not.toHaveBeenCalled();
	});
});
