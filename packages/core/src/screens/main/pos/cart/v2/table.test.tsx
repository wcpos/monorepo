/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CartTable } from './table';

const mockPulseAdd = jest.fn();
type TestLine = {
	quantity: number;
	name: string;
	total: string;
	meta_data: { key: string; value: string }[];
};
const mockCartLines = {
	line_items: [] as TestLine[],
	fee_lines: [] as TestLine[],
	shipping_lines: [] as TestLine[],
};
let mockSortLines = 'newest_bottom';

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('@tanstack/react-table', () => ({
	columnVisibilityFeature: {},
	flexRender: (renderHeader: (context: unknown) => React.ReactNode, context: unknown) =>
		renderHeader(context),
	tableFeatures: () => ({}),
	useTable: ({
		data,
		columns,
	}: {
		data: { uuid: string }[];
		columns: { id: string; header: () => React.ReactNode }[];
	}) => ({
		getHeaderGroups: () => [
			{
				id: 'headers',
				headers: columns.map((columnDef) => ({
					id: columnDef.id,
					column: { columnDef },
					getContext: () => ({ column: { id: columnDef.id } }),
				})),
			},
		],
		getRowModel: () => ({
			rows: data.map((line) => ({
				id: line.uuid,
				original: line,
				getVisibleCells: () => [],
			})),
		}),
	}),
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => [],
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/lib/utils', () => ({
	getFlexAlign: () => undefined,
}));

jest.mock('@wcpos/components/table', () => {
	const React = jest.requireActual<typeof import('react')>('react');
	function Passthrough({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	const PulseTableRow = React.forwardRef<
		{ pulseAdd: () => void },
		React.PropsWithChildren<{ row: { id: string } }>
	>(function PulseTableRow({ children, row }, ref) {
		React.useImperativeHandle(ref, () => ({
			pulseAdd: () => mockPulseAdd(row.id),
		}));
		return (
			<div data-testid="cart-row" data-uuid={row.id}>
				{children}
			</div>
		);
	});

	return {
		PulseTableRow,
		Table: Passthrough,
		TableBody: Passthrough,
		TableCell: Passthrough,
		TableHead: Passthrough,
		TableHeader: Passthrough,
		TableRow: Passthrough,
	};
});

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

jest.mock('./cells/line-strip', () => ({
	LineStrip: ({ children }: React.PropsWithChildren) => (
		<>{typeof children === 'function' ? null : children}</>
	),
}));
jest.mock('../cells/fee-and-shipping-total', () => ({ FeeAndShippingTotal: () => null }));
let mockIsPhone = false;
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockIsPhone }));
jest.mock('./cells/fee-name', () => ({ FeeName: () => null }));
jest.mock('../cells/fee-price', () => ({ FeePrice: () => null }));
jest.mock('../cells/image', () => ({ LineItemImage: () => null }));
jest.mock('./cells/price', () => ({ Price: () => null }));
jest.mock('./cells/product-name', () => ({ ProductName: () => null }));
jest.mock('./cells/product-total', () => ({ ProductTotal: () => null }));
jest.mock('./cells/quantity-keypad', () => ({ Quantity: () => null }));
jest.mock('../cells/regular_price', () => ({ RegularPrice: () => null }));
jest.mock('../cells/shipping-price', () => ({ ShippingPrice: () => null }));
jest.mock('./cells/shipping-title', () => ({ ShippingTitle: () => null }));
jest.mock('../cells/sku', () => ({ SKU: () => null }));
jest.mock('../cells/subtotal', () => ({ Subtotal: () => null }));

jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			columns: ['quantity', 'name', 'price', 'total'].map((key) => ({ key, show: true })),
			sortLines: mockSortLines,
		},
		getUILabel: (key: string) =>
			({ quantity: 'Qty', name: 'Name', price: 'Price', total: 'Total' })[key],
	}),
}));

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));

jest.mock('../../hooks/use-cart-lines', () => ({
	useCartLines: () => mockCartLines,
}));

const line = (uuid: string, name = uuid, total = '0') => ({
	quantity: 1,
	name,
	total,
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
});

describe('CartTable pulse baseline', () => {
	beforeEach(() => {
		mockPulseAdd.mockClear();
		mockCartLines.fee_lines = [];
		mockCartLines.shipping_lines = [];
		mockSortLines = 'newest_bottom';
		mockCartLines.line_items = [line('line-a')];
	});

	it('pulses when a removed line is re-added with the same uuid', () => {
		const { rerender } = render(<CartTable />);
		expect(mockPulseAdd).not.toHaveBeenCalled();

		mockCartLines.line_items = [];
		rerender(<CartTable />);

		mockCartLines.line_items = [line('line-a')];
		rerender(<CartTable />);

		expect(mockPulseAdd).toHaveBeenCalledTimes(1);
		expect(mockPulseAdd).toHaveBeenCalledWith('line-a');
	});
});

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));

it.each([
	['newest_bottom', ['zebra', 'apple', 'bear']],
	['newest_top', ['bear', 'apple', 'zebra']],
	['name', ['apple', 'bear', 'zebra']],
	['price', ['bear', 'zebra', 'apple']],
])('%s renders fees then shipping after products', (setting, expected) => {
	mockSortLines = setting;
	mockCartLines.line_items = [
		line('zebra', 'Zebra', '2'),
		line('apple', 'Apple', '3'),
		line('bear', 'Bear', '1'),
	];
	mockCartLines.fee_lines = [line('fee', 'A fee', '0')];
	mockCartLines.shipping_lines = [line('shipping', 'A shipment', '0')];
	render(<CartTable />);
	expect(screen.getAllByTestId('cart-row').map((row) => row.getAttribute('data-uuid'))).toEqual([
		...expected,
		'fee',
		'shipping',
	]);
});
it('renders the four cart header labels', () => {
	render(<CartTable />);
	for (const label of ['Qty', 'Item', 'Price', 'Total'])
		expect(screen.getByText(label)).toBeTruthy();
});
it('has no Price column on the phone (the decided cart line at phone width)', () => {
	mockIsPhone = true;
	try {
		render(<CartTable />);
		expect(screen.queryByText('Price')).toBeNull();
		expect(screen.getByText('Total')).toBeTruthy();
	} finally {
		mockIsPhone = false;
	}
});
it('pulses once for an added line and does not pulse again on an unchanged rerender', () => {
	mockPulseAdd.mockClear();
	mockCartLines.line_items = [];
	mockCartLines.fee_lines = [];
	mockCartLines.shipping_lines = [];
	const { rerender } = render(<CartTable />);
	mockCartLines.line_items = [line('added')];
	rerender(<CartTable />);
	rerender(<CartTable />);
	expect(mockPulseAdd.mock.calls).toEqual([['added']]);
});
