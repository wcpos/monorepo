/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { QueryStateProvider } from '../../../../../query/query-state-store';
import { ProductGridFooter } from './grid-footer';

jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/loader', () => ({
	Loader: () => <span data-testid="loader" />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('react-native', () => ({
	View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

function renderFooter(
	count: number,
	binding: { pending$: BehaviorSubject<boolean>; exhausted$: BehaviorSubject<boolean | null> },
	resultCount = count
) {
	return render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
		>
			<ProductGridFooter binding={binding} count={count} resultCount={resultCount} />
		</QueryStateProvider>
	);
}

describe('ProductGridFooter', () => {
	const settled = () => ({
		pending$: new BehaviorSubject(false),
		exhausted$: new BehaviorSubject<boolean | null>(null),
	});

	it('says nothing under an empty grid, even when the engine says exhausted', () => {
		const binding = settled();
		binding.exhausted$.next(true);
		renderFooter(0, binding);
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('settles a full exhausted read to silence, not an end row', () => {
		const binding = settled();
		binding.pending$.next(true);
		renderFooter(10, binding);
		expect(screen.getByTestId('pos-products-grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();

		React.act(() => {
			binding.pending$.next(false);
			binding.exhausted$.next(true);
		});
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('settles a short exhausted read from spinner to end row', () => {
		const binding = settled();
		binding.pending$.next(true);
		renderFooter(4, binding);
		expect(screen.getByTestId('pos-products-grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();

		React.act(() => {
			binding.pending$.next(false);
			binding.exhausted$.next(true);
		});
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.getByTestId('pos-products-grid-end').textContent).toBe(
			'pos_products.no_more_products'
		);
	});

	it('does not treat a full local read with fewer rendered tiles as terminal', () => {
		const binding = settled();
		binding.exhausted$.next(true);
		renderFooter(2, binding, 10);
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('says nothing under an empty rendered grid with a pending full local read', () => {
		const binding = settled();
		binding.pending$.next(true);
		renderFooter(0, binding, 10);
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('shows nothing while the engine says more may exist, even under a short page', () => {
		const binding = settled();
		binding.exhausted$.next(false);
		renderFooter(2, binding);
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('falls back to the short-page rule when the engine has no opinion', () => {
		const short = renderFooter(4, settled());
		expect(screen.getByTestId('pos-products-grid-end')).toBeTruthy();

		short.unmount();
		renderFooter(10, settled());
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});
});
