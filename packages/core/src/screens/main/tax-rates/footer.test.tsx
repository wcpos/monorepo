/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { TaxRatesFooter } from './footer';
import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../query';

import type { QueryStateOf } from '../../../query';

// The tax-rates query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};

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
		active,
	}: {
		sync: () => Promise<void>;
		clearAndSync: () => Promise<void>;
		active: boolean;
	}) => (
		<>
			<output data-testid="sync-active">{String(active)}</output>
			<button data-testid="sync" onClick={() => void sync()} />
			<button data-testid="clear-and-sync" onClick={() => void clearAndSync()} />
		</>
	),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values?.total !== undefined
			? `${key}:${values.synced}/${values.total}`
			: values?.country !== undefined
				? `${key}:${values.n}/${values.country}`
				: `${key}:${values?.count}`,
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

/** A handle carrying a total of 5 (answered unless `partial` says otherwise). */
function handleWithTotal(partial: Record<string, unknown> = {}) {
	const handle = fakeQueryHandle({ total: 5, ...partial });
	handle.sync = mockSync;
	return handle;
}

/** `handle` is the live one (spinner, sync); `shown` the drawn one (total), the same by default. */
function renderFooter(
	handle: FakeHandle = handleWithTotal(),
	shown: FakeHandle = handle,
	applies: { n: number; country: string } | null = null
) {
	return render(
		<QueryStateProvider
			collection="tax-rates"
			initialPageSize={10}
			initialSort={{ field: 'id', direction: 'asc' }}
		>
			<QueryStateProbe />
			<TaxRatesFooter count={3} handle={handle} shown={shown} applies={applies} />
		</QueryStateProvider>
	);
}

function currentState(): QueryStateOf<'tax-rates'> {
	return JSON.parse(
		screen.getByTestId('query-state').textContent ?? ''
	) as QueryStateOf<'tax-rates'>;
}

describe('TaxRatesFooter handle fields', () => {
	beforeEach(() => jest.clearAllMocks());

	it('says how many of the vouched total are synced while behind, and syncs through the handle', () => {
		renderFooter();

		expect(screen.getByText('tax_rates.count_synced:3/5')).toBeTruthy();
		fireEvent.click(screen.getByTestId('sync'));
		expect(mockSync).toHaveBeenCalledTimes(1);
	});

	it('follows the handle’s sync activity', () => {
		const handle = handleWithTotal();
		renderFooter(handle);
		expect(screen.getByTestId('sync-active').textContent).toBe('false');

		act(() => handle.set({ active: true }));
		expect(screen.getByTestId('sync-active').textContent).toBe('true');
	});

	it('prints no denominator while the handle is unanswered, then the total once it answers', () => {
		// A total the handle carries before its read has answered vouches for nothing yet.
		const handle = handleWithTotal({ ready: false });
		renderFooter(handle);

		expect(screen.getByText('tax_rates.count:3')).toBeTruthy();
		expect(screen.queryByText('tax_rates.count_synced:3/5')).toBeNull();

		act(() => handle.set({ ready: true }));
		expect(screen.getByText('tax_rates.count_synced:3/5')).toBeTruthy();
	});

	it('prints no denominator when the handle has no total to vouch for', () => {
		renderFooter(handleWithTotal({ total: null }));

		expect(screen.getByText('tax_rates.count:3')).toBeTruthy();
	});

	it('is a plain count once the device holds every vouched rate', () => {
		renderFooter(handleWithTotal({ total: 3 }));

		expect(screen.getByText('tax_rates.count:3')).toBeTruthy();
	});

	it('keeps the drawn handle’s total while the live one loads, and syncs the live one', () => {
		// A scope bump hands the modal a fresh handle; the rates drawn (and `count`) are still
		// the previous handle's, so its total is the denominator that describes them.
		const live = fakeQueryHandle({ ready: false, active: true });
		const liveSync = jest.fn(async () => undefined);
		live.sync = liveSync;
		renderFooter(live, handleWithTotal());

		expect(screen.getByText('tax_rates.count_synced:3/5')).toBeTruthy();
		expect(screen.getByTestId('sync-active').textContent).toBe('true');
		fireEvent.click(screen.getByTestId('sync'));
		expect(liveSync).toHaveBeenCalledTimes(1);
		expect(mockSync).not.toHaveBeenCalled();
	});

	it('resets query state before clear-and-sync', () => {
		renderFooter();
		fireEvent.click(screen.getByTestId('activate-query'));
		expect(currentState()).toMatchObject({ search: 'not-a-screen-feature', limit: 20 });

		expect(screen.getByText('tax_rates.count_synced:3/5')).toBeTruthy();
		fireEvent.click(screen.getByTestId('clear-and-sync'));
		expect(currentState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: 10,
		});
		expect(mockClearAndSync).toHaveBeenCalledTimes(1);
	});

	it('appends how many apply to the address the panel was opened from', () => {
		renderFooter(handleWithTotal({ total: 3 }), undefined, { n: 2, country: 'GB' });
		expect(screen.getByText('tax_rates.count:3 · tax_rates.count_applies:2/GB')).toBeTruthy();
	});

	it('says none apply rather than 0', () => {
		renderFooter(handleWithTotal({ total: 3 }), undefined, { n: 0, country: 'IS' });
		expect(
			screen.getByText('tax_rates.count:3 · tax_rates.count_applies_none:undefined/IS')
		).toBeTruthy();
	});
});
