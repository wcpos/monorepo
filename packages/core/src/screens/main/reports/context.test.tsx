/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';

import { ReportsProvider, useReportsBinding, useReportsData, useReportsSelection } from './context';
import { QueryStateProvider, useQueryStateActions } from '../../../query';

jest.mock('../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
}));

const orders = [{ uuid: 'one' }, { uuid: 'two' }] as import('@wcpos/database').OrderDocument[];
const binding = {
	resource: new ObservableResource(
		of({ hits: orders.map((document) => ({ id: document.uuid, document })) })
	),
};
const Provider = ReportsProvider as unknown as React.ComponentType<{
	binding: typeof binding;
	children: React.ReactNode;
}>;

function Probe() {
	const data = useReportsData();
	const selection = useReportsSelection();
	const reports = { ...data, ...selection };
	const actions = useQueryStateActions<'orders'>();
	return (
		<div>
			<div data-testid="all-orders">{reports.allOrders.map((order) => order.uuid).join(',')}</div>
			<div data-testid="selected-orders">
				{reports.selectedOrders.map((order) => order.uuid).join(',')}
			</div>
			<div data-testid="date-range">
				{`${reports.dateRange.start.toISOString()}|${reports.dateRange.end.toISOString()}`}
			</div>
			<button
				data-testid="exclude-one"
				onClick={() => reports.setUnselectedRowIds({ one: true })}
			/>
			<button
				data-testid="change-date"
				onClick={() =>
					actions.setFilter('dateRange', {
						from: '2026-07-10T00:00:00.000Z',
						to: '2026-07-11T23:59:59.999Z',
					})
				}
			/>
		</div>
	);
}

describe('ReportsProvider binding context', () => {
	it('derives orders, selection, and dates from the binding result plus query state', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
				initialFilters={{
					dateRange: {
						from: '2026-07-01T00:00:00.000Z',
						to: '2026-07-02T23:59:59.999Z',
					},
				}}
			>
				<React.Suspense fallback={null}>
					<Provider binding={binding}>
						<Probe />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		expect(screen.getByTestId('all-orders').textContent).toBe('one,two');
		expect(screen.getByTestId('selected-orders').textContent).toBe('one,two');
		expect(screen.getByTestId('date-range').textContent).toBe(
			'2026-07-01T00:00:00.000Z|2026-07-02T23:59:59.999Z'
		);

		fireEvent.click(screen.getByTestId('exclude-one'));
		expect(screen.getByTestId('selected-orders').textContent).toBe('two');

		fireEvent.click(screen.getByTestId('change-date'));
		expect(screen.getByTestId('date-range').textContent).toBe(
			'2026-07-10T00:00:00.000Z|2026-07-11T23:59:59.999Z'
		);
	});

	/**
	 * `ReportsSyncProgress` reads nothing but `binding`, and the binding does not change when
	 * the cashier ticks a row — but the whole bundle used to be republished together, so it
	 * re-rendered on every selection change and every order emission.
	 *
	 * The consumer is memoised with no props, so a parent render alone cannot reach it.
	 */
	it('does not re-render a binding-only consumer when the row selection changes', () => {
		const onBindingRender = jest.fn();
		const BindingConsumer = React.memo(function BindingConsumer() {
			useReportsBinding();
			onBindingRender();
			return null;
		});

		function SelectionButton() {
			const { setUnselectedRowIds } = useReportsSelection();
			return <button data-testid="exclude" onClick={() => setUnselectedRowIds({ one: true })} />;
		}

		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<React.Suspense fallback={null}>
					<Provider binding={binding}>
						<BindingConsumer />
						<SelectionButton />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		const rendersBefore = onBindingRender.mock.calls.length;
		expect(rendersBefore).toBeGreaterThan(0);

		fireEvent.click(screen.getByTestId('exclude'));

		expect(onBindingRender).toHaveBeenCalledTimes(rendersBefore);
	});
});
