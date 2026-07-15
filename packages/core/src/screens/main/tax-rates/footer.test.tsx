/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { TaxRatesFooter } from './footer';
import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../query';

import type { QueryStateOf } from '../../../query';

const mockClearAndSync = jest.fn(async () => undefined);
const mockSync = jest.fn(async () => undefined);

jest.mock('@wcpos/query', () => ({
	useReplicationState: () => {
		throw new Error('legacy replication projection reached');
	},
}));
jest.mock('../hooks/use-collection-reset', () => ({
	useCollectionReset: (collection: string) => {
		if (collection !== 'taxes') throw new Error(`unexpected collection: ${collection}`);
		return { clearAndSync: mockClearAndSync };
	},
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../components/sync-button', () => ({
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
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${values.shown}/${values.total}` : key,
}));

function QueryStateProbe() {
	const state = useQueryState<'tax-rates'>();
	const actions = useQueryStateActions<'tax-rates'>();
	return (
		<>
			<button
				data-testid="activate-query"
				onClick={() => {
					actions.setSearch('not-a-screen-feature');
					actions.extendLimit();
				}}
			/>
			<output data-testid="query-state">{JSON.stringify(state)}</output>
		</>
	);
}

function renderFooter(source: 'coverage' | 'local') {
	const Footer = TaxRatesFooter as unknown as React.ComponentType<Record<string, unknown>>;
	return render(
		<QueryStateProvider
			collection="tax-rates"
			initialPageSize={10}
			initialSort={{ field: 'id', direction: 'asc' }}
		>
			<QueryStateProbe />
			<Footer
				count={3}
				active$={of(false)}
				total$={of(5)}
				totalSource$={of(source)}
				sync={mockSync}
			/>
		</QueryStateProvider>
	);
}

function currentState(): QueryStateOf<'tax-rates'> {
	return JSON.parse(
		screen.getByTestId('query-state').textContent ?? ''
	) as QueryStateOf<'tax-rates'>;
}

describe('TaxRatesFooter binding projections', () => {
	beforeEach(() => jest.clearAllMocks());

	it('shows Tier-0 coverage totals and keeps direct sync', () => {
		renderFooter('coverage');

		expect(screen.getByText('common.showing_of:3/5')).toBeTruthy();
		expect(screen.queryByText('common.showing_local_items')).toBeNull();
		fireEvent.click(screen.getByTestId('sync'));
		expect(mockSync).toHaveBeenCalledTimes(1);
	});

	it('labels local fallback totals and resets query state before clear-and-sync', () => {
		renderFooter('local');
		fireEvent.click(screen.getByTestId('activate-query'));
		expect(currentState()).toMatchObject({ search: 'not-a-screen-feature', limit: 20 });

		expect(screen.getByText('common.showing_local_items')).toBeTruthy();
		fireEvent.click(screen.getByTestId('clear-and-sync'));
		expect(currentState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: 10,
		});
		expect(mockClearAndSync).toHaveBeenCalledTimes(1);
	});
});
