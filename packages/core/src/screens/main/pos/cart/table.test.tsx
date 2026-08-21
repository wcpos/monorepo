/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { CartTable } from './table';

const mockPulseAdd = jest.fn();
const mockCartLines = {
	line_items: [] as { quantity: number; meta_data: { key: string; value: string }[] }[],
	fee_lines: [],
	shipping_lines: [],
};

jest.mock('@tanstack/react-table', () => ({
	columnVisibilityFeature: {},
	flexRender: () => null,
	tableFeatures: () => ({}),
	useTable: ({ data }: { data: { uuid: string }[] }) => ({
		getHeaderGroups: () => [],
		getRowModel: () => ({
			rows: data.map((line) => ({
				id: line.uuid,
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
		return <>{children}</>;
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
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/fee-and-shipping-total', () => ({ FeeAndShippingTotal: () => null }));
jest.mock('./cells/fee-name', () => ({ FeeName: () => null }));
jest.mock('./cells/fee-price', () => ({ FeePrice: () => null }));
jest.mock('./cells/image', () => ({ LineItemImage: () => null }));
jest.mock('./cells/price', () => ({ Price: () => null }));
jest.mock('./cells/product-name', () => ({ ProductName: () => null }));
jest.mock('./cells/product-total', () => ({ ProductTotal: () => null }));
jest.mock('./cells/quantity', () => ({ Quantity: () => null }));
jest.mock('./cells/regular_price', () => ({ RegularPrice: () => null }));
jest.mock('./cells/shipping-price', () => ({ ShippingPrice: () => null }));
jest.mock('./cells/shipping-title', () => ({ ShippingTitle: () => null }));
jest.mock('./cells/sku', () => ({ SKU: () => null }));
jest.mock('./cells/subtotal', () => ({ Subtotal: () => null }));

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { columns$: {} },
		getUILabel: (key: string) => key,
	}),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1' } }),
}));

jest.mock('../hooks/use-cart-lines', () => ({
	useCartLines: () => mockCartLines,
}));

const line = (uuid: string) => ({
	quantity: 1,
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
});

describe('CartTable pulse baseline', () => {
	beforeEach(() => {
		mockPulseAdd.mockClear();
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
