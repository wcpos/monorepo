/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Cashier } from './cashier';

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children }: { children?: React.ReactNode }) => (
		<button data-testid="cashier-pill" type="button">
			{children}
		</button>
	),
}));

jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: (id: unknown) => ({ id, label: id === undefined ? '' : `cashier-${id}` }),
}));

type OrderMeta = { key?: string; value?: unknown };

/**
 * Stands in for the engine adapter's document proxy, whose `$` getter builds a NEW
 * observable on every property access. `metaAccesses` is what the test is really about: a
 * fresh stream per render means a resubscribe per render, for every visible row.
 */
function makeOrder(meta: OrderMeta[]) {
	const meta$ = new BehaviorSubject<OrderMeta[]>(meta);
	const order = {
		accesses: 0,
		get meta_data$() {
			order.accesses += 1;
			// A new piped observable each access, exactly as the proxy does.
			return meta$.pipe((source) => source);
		},
		push: (next: OrderMeta[]) => meta$.next(next),
	};
	return order;
}

function cellProps(order: unknown) {
	return {
		row: { original: { document: order } },
		table: { options: { meta: { actions: { setFilter: jest.fn() } } } },
	} as unknown as React.ComponentProps<typeof Cashier>;
}

describe('Cashier cell', () => {
	it('renders the cashier resolved from _pos_user meta', () => {
		const order = makeOrder([{ key: '_pos_user', value: '7' }]);

		render(<Cashier {...cellProps(order)} />);

		expect(screen.getByTestId('cashier-pill').textContent).toBe('cashier-7');
	});

	it('does not rebuild the meta stream on re-render', () => {
		const order = makeOrder([{ key: '_pos_user', value: '7' }]);

		const { rerender } = render(<Cashier {...cellProps(order)} />);
		const afterFirstRender = order.accesses;

		rerender(<Cashier {...cellProps(order)} />);
		rerender(<Cashier {...cellProps(order)} />);
		rerender(<Cashier {...cellProps(order)} />);

		expect(order.accesses).toBe(afterFirstRender);
	});

	it('still follows a live meta write', () => {
		const order = makeOrder([{ key: '_pos_user', value: '7' }]);

		render(<Cashier {...cellProps(order)} />);

		act(() => {
			order.push([{ key: '_pos_user', value: '9' }]);
		});

		expect(screen.getByTestId('cashier-pill').textContent).toBe('cashier-9');
	});

	it('renders nothing for an order with no cashier', () => {
		const order = makeOrder([]);

		render(<Cashier {...cellProps(order)} />);

		expect(screen.queryByTestId('cashier-pill')).toBeNull();
	});
});
