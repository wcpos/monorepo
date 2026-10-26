/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

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

type Engine = { pending: boolean; exhausted: boolean | null };

function footer(renderedCount: number, engine: Engine, hitCount = renderedCount, short = false) {
	return (
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
		>
			<ProductGridFooter {...{ engine, renderedCount, hitCount, short }} />
		</QueryStateProvider>
	);
}

function renderFooter(renderedCount: number, engine: Engine, hitCount = renderedCount) {
	return render(footer(renderedCount, engine, hitCount));
}

describe('ProductGridFooter', () => {
	const settled = (): Engine => ({ pending: false, exhausted: null });

	it('shows loading at the local end while the place is short', () => {
		render(footer(4, { pending: false, exhausted: true }, 4, true));
		expect(screen.getByTestId('pos-products-grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('shows the end row when the place is not short', () => {
		render(footer(4, { pending: false, exhausted: true }, 4, false));
		expect(screen.getByTestId('pos-products-grid-end')).toBeTruthy();
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
	});

	it('says nothing under an empty grid, even when the engine says exhausted', () => {
		renderFooter(0, { ...settled(), exhausted: true });
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('settles a full exhausted read to silence, not an end row', () => {
		const { rerender } = renderFooter(10, { ...settled(), pending: true });
		expect(screen.getByTestId('pos-products-grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();

		rerender(footer(10, { pending: false, exhausted: true }));
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('settles a short exhausted read from spinner to end row', () => {
		const { rerender } = renderFooter(4, { ...settled(), pending: true });
		expect(screen.getByTestId('pos-products-grid-loading')).toBeTruthy();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();

		rerender(footer(4, { pending: false, exhausted: true }));
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.getByTestId('pos-products-grid-end').textContent).toBe(
			'pos_products.no_more_products'
		);
	});

	it('does not treat a full local read with fewer rendered tiles as terminal', () => {
		renderFooter(2, { ...settled(), exhausted: true }, 10);
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('says nothing under an empty rendered grid with a pending full local read', () => {
		renderFooter(0, { ...settled(), pending: true }, 10);
		expect(screen.queryByTestId('pos-products-grid-loading')).toBeNull();
		expect(screen.queryByTestId('pos-products-grid-end')).toBeNull();
	});

	it('says nothing under an empty rendered grid with a settled full exhausted read', () => {
		const { container } = renderFooter(0, { ...settled(), exhausted: true }, 10);
		expect(container.firstChild).toBeNull();
	});

	it('shows nothing while the engine says more may exist, even under a short page', () => {
		renderFooter(2, { ...settled(), exhausted: false });
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
