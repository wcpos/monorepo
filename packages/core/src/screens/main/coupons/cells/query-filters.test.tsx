/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../../query';
import { DiscountType } from './discount-type';
import { Status } from './status';

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (value: unknown) => value,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

function Harness({ cell }: { cell: 'discount_type' | 'status' }) {
	const actions = useQueryStateActions<'coupons'>();
	const filters = useQueryState<'coupons', string>((state) => JSON.stringify(state.filters));
	const document = { discount_type$: 'fixed_cart', status$: 'draft' };
	const props = {
		row: { original: { document } },
		table: { options: { meta: { actions: { setFilter: actions.setFilter } } } },
	};
	const Cell = (cell === 'discount_type' ? DiscountType : Status) as unknown as React.ComponentType<
		Record<string, unknown>
	>;

	return (
		<>
			<Cell {...props} />
			<div data-testid="coupon-filters">{filters}</div>
		</>
	);
}

function renderCell(cell: 'discount_type' | 'status') {
	return render(
		<QueryStateProvider
			collection="coupons"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<Harness cell={cell} />
		</QueryStateProvider>
	);
}

describe('coupon filter cells', () => {
	it('filters by discount type through the narrow table-meta action', () => {
		renderCell('discount_type');

		fireEvent.click(screen.getByRole('button'));

		expect(screen.getByTestId('coupon-filters').textContent).toBe(
			JSON.stringify({ discount_type: 'fixed_cart' })
		);
	});

	it('filters by status through the narrow table-meta action', () => {
		renderCell('status');

		fireEvent.click(screen.getByRole('button'));

		expect(screen.getByTestId('coupon-filters').textContent).toBe(
			JSON.stringify({ status: 'draft' })
		);
	});
});
