/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DataTableFooter } from './footer';
import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../../query';

import type { QueryStateOf } from '../../../../query';

const mockClearAndSync = jest.fn(async () => undefined);
const mockSync = jest.fn(async () => undefined);
const mockUseCollectionReset = jest.fn((_collectionName: string) => ({
	clearAndSync: mockClearAndSync,
}));

jest.mock('@wcpos/query', () => ({
	useReplicationState: () => {
		throw new Error('legacy replication projection reached');
	},
}));
jest.mock('../../hooks/use-collection-reset', () => ({
	useCollectionReset: (collectionName: string) => mockUseCollectionReset(collectionName),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('../sync-button', () => ({
	SyncButton: ({
		sync,
		clearAndSync,
	}: {
		sync: () => Promise<void>;
		clearAndSync: () => Promise<void>;
	}) => (
		<>
			<button data-testid="sync" onClick={() => void sync()} />
			<button data-testid="clear-and-sync" onClick={() => void clearAndSync()} />
		</>
	),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${values.shown}/${values.total}` : key,
}));

function renderFooter() {
	return render(
		<QueryStateProvider
			collection="coupons"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<DataTableFooter
				collectionName="coupons"
				drawnCount={10}
				total={27}
				active={false}
				sync={mockSync}
			/>
		</QueryStateProvider>
	);
}

function CouponQueryStateProbe() {
	const state = useQueryState<'coupons'>();
	const actions = useQueryStateActions<'coupons'>();

	return (
		<>
			<button
				data-testid="activate-query"
				onClick={() => {
					actions.setSearch('summer');
					actions.setFilter('status', 'expired');
					actions.setFilter('discount_type', 'fixed_cart');
					actions.extendLimit();
				}}
			/>
			<output data-testid="query-state">{JSON.stringify(state)}</output>
		</>
	);
}

function currentCouponQueryState(): QueryStateOf<'coupons'> {
	return JSON.parse(screen.getByTestId('query-state').textContent ?? '') as QueryStateOf<'coupons'>;
}

describe('DataTableFooter', () => {
	beforeEach(() => jest.clearAllMocks());

	it('shows the plain showing-of total — never an at-least suffix', () => {
		renderFooter();

		expect(screen.getByTestId('data-table-count').textContent).toBe('common.showing_of:10/27');
		expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('10');
		expect(screen.getByTestId('data-table-total-count').textContent).toBe('27');
		expect(mockUseCollectionReset).toHaveBeenCalledWith('coupons');
	});

	it('names no denominator for a null total: nothing vouches for one', () => {
		render(
			<QueryStateProvider
				collection="coupons"
				initialPageSize={10}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<DataTableFooter
					collectionName="coupons"
					drawnCount={10}
					total={null}
					active={false}
					sync={mockSync}
				/>
			</QueryStateProvider>
		);
		expect(screen.getByTestId('data-table-count').textContent).toBe(
			'common.showing_n:10/undefined'
		);
		expect(screen.getByTestId('data-table-total-count').textContent).toBe('');
	});

	it('retains sync/reset actions', () => {
		renderFooter();

		fireEvent.click(screen.getByTestId('sync'));
		fireEvent.click(screen.getByTestId('clear-and-sync'));
		expect(mockSync).toHaveBeenCalledTimes(1);
		expect(mockClearAndSync).toHaveBeenCalledTimes(1);
	});

	it('restores provider search and filter initials before clearing and syncing', () => {
		render(
			<QueryStateProvider
				collection="coupons"
				initialPageSize={10}
				initialSort={{ field: 'amount', direction: 'asc' }}
				initialFilters={{ status: 'future' }}
			>
				<CouponQueryStateProbe />
				<DataTableFooter
					collectionName="coupons"
					drawnCount={0}
					total={27}
					active={false}
					sync={mockSync}
				/>
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByTestId('activate-query'));
		expect(currentCouponQueryState()).toEqual({
			search: 'summer',
			filters: { status: 'expired', discount_type: 'fixed_cart' },
			sort: { field: 'amount', direction: 'asc' },
			limit: 20,
		});

		const providerInitials: QueryStateOf<'coupons'> = {
			search: '',
			filters: { status: 'future' },
			sort: { field: 'amount', direction: 'asc' },
			limit: 10,
		};
		fireEvent.click(screen.getByTestId('clear-and-sync'));
		expect(currentCouponQueryState()).toEqual(providerInitials);
		expect(mockClearAndSync).toHaveBeenCalledTimes(1);
	});
});
