/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Cashier } from './cashier';

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children }: { children?: React.ReactNode }) => (
		<button data-testid="cashier-pill" type="button">
			{children}
		</button>
	),
}));

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));

jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: (id: unknown) => ({
		id,
		label: id === undefined ? '' : `cashier-${id}`,
	}),
}));

function cellProps(metaData: { key?: string; value?: unknown }[]) {
	return {
		row: {
			original: { document: {}, record: { payload: { meta_data: metaData } } },
		},
		table: { options: { meta: { actions: { setFilter: jest.fn() } } } },
	} as unknown as React.ComponentProps<typeof Cashier>;
}

describe('Cashier cell', () => {
	it('renders the cashier resolved from _pos_user meta', () => {
		render(<Cashier {...cellProps([{ key: '_pos_user', value: '7' }])} />);

		expect(screen.getByTestId('cashier-pill').textContent).toBe('cashier-7');
	});

	it('reads the replacement row record', () => {
		const { rerender } = render(<Cashier {...cellProps([{ key: '_pos_user', value: '7' }])} />);
		rerender(<Cashier {...cellProps([{ key: '_pos_user', value: '9' }])} />);

		expect(screen.getByTestId('cashier-pill').textContent).toBe('cashier-9');
	});

	it('renders nothing for an order with no cashier', () => {
		render(<Cashier {...cellProps([])} />);

		expect(screen.queryByTestId('cashier-pill')).toBeNull();
	});
});
