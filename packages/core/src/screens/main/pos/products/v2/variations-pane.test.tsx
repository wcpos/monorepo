/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';

import { VariationsPane } from './variations-pane';
import { VariationRow } from './rows/variation-row';

// The variations handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
	retained: number;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>, key?: string) => FakeHandle;
};
const addVariation = jest.fn();
const hits = [
	{ id: 'one', record: { remoteId: 1, payload: { stock_status: 'instock' } } },
	{ id: 'two', record: { remoteId: 2, payload: { stock_status: 'outofstock' } } },
];
const answeredWith = (found: typeof hits = hits) =>
	fakeQueryHandle({ result: { hits: found }, total: 99 });
let mockHandle: FakeHandle = answeredWith();
const bind = jest.fn((..._args: unknown[]) => mockHandle);
// The registry, for the reset test: one handle per key while retained, joined on the owner's
// retain and left on the last release, as the real one claims the key on start and releases it
// on stop. A remount after every holder left gets a FRESH handle; one still held gets the old.
const mockRegistry = {
	on: false,
	handles: new Map<string, FakeHandle>(),
	created: [] as FakeHandle[],
};
function mockAcquire(key: string): FakeHandle {
	const live = mockRegistry.handles.get(key);
	if (live) return live;
	const handle = fakeQueryHandle({ ready: false }, key);
	mockRegistry.created.push(handle);
	const retain = handle.retain;
	handle.retain = () => {
		mockRegistry.handles.set(key, handle);
		const release = retain();
		// The owner's retain starts the read; its first answer is one microtask later.
		void Promise.resolve().then(() => handle.set({ ready: true, result: { hits } }));
		return () => {
			release();
			if (handle.retained === 0 && mockRegistry.handles.get(key) === handle) {
				mockRegistry.handles.delete(key);
			}
		};
	};
	return handle;
}
jest.mock('../../../../../query', () => {
	const ReactActual = jest.requireActual('react') as typeof React;
	return {
		...jest.requireActual('../../../../../query'),
		// The owner's contract: acquire by key (memoised on the fiber), retain while mounted.
		useCollectionQueryHandle: (...args: unknown[]) => {
			const key = JSON.stringify(args.slice(1));
			const fixed = bind(...args);
			const acquired = ReactActual.useMemo(
				() => (mockRegistry.on ? mockAcquire(key) : null),
				[key]
			);
			const handle = acquired ?? fixed;
			ReactActual.useEffect(() => handle.retain(), [handle]);
			return handle;
		},
		useQueryState: () => ({ filters: { status: 'publish' } }),
		useQueryStateActions: () => ({}),
	};
});
jest.mock('@wcpos/query', () => ({
	queryHandleAnswers$: jest.requireActual('@wcpos/query').queryHandleAnswers$,
	useDocField: (record: object, select: (value: object) => unknown) => select(record),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: object) => JSON.stringify({ key, ...values }),
}));
// The real Suspense: a fallback commit is what the pane avoids, so it must be observable.
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('./rows/product-row', () => ({
	useVariationCount: () => 0,
	InCartCount: ({ empty }: { empty: React.ReactNode }) => empty,
}));
jest.mock('../cells/variation-name', () => ({ ProductVariationName: () => null }));
jest.mock('../cells/stock-quantity', () => ({ StockQuantity: () => null }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: React.PropsWithChildren) => children,
}));
// Every skeleton committed, by the pane or as a Suspense fallback.
const mockSkeletonMounts = { value: 0 };
jest.mock('../../../components/data-table/v2/skeleton', () => {
	const ReactActual = jest.requireActual('react') as typeof React;
	return {
		DataTableSkeleton: ({ rowCount }: { rowCount: number }) => {
			ReactActual.useEffect(() => {
				mockSkeletonMounts.value += 1;
			}, []);
			return <div data-testid="skeleton" data-rows={rowCount} />;
		},
	};
});
// The table is handed the handle itself; its footer, values.
const mockTableProps: { value: Record<string, unknown> } = { value: {} };
jest.mock('../../../components/data-table/v2', () => ({
	DataTable: (props: {
		tableConfig: { data: typeof hits };
		handle: unknown;
		TableFooterComponent: React.ComponentType<{ count: number; total: number | null }>;
	}) => {
		mockTableProps.value = props;
		const { tableConfig, TableFooterComponent } = props;
		return (
			<>
				<output data-testid="hits">{tableConfig.data.map((hit) => hit.id).join(',')}</output>
				<TableFooterComponent count={tableConfig.data.length} total={99} />
			</>
		);
	},
}));
jest.mock('../../../components/data-table/v2/rows', () => ({
	DataTableRow: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('./variations-grid', () => ({
	VariationsGrid: ({ hits: found, back }: { hits?: typeof hits; back: () => void }) => (
		<button data-testid="grid" onClick={back}>
			{found ? found.map((hit) => hit.id).join(',') : 'unanswered'}
		</button>
	),
}));
// The footer takes values: the denominator is whatever `total` it is handed.
jest.mock('./footer', () => ({
	ProductsFooter: ({
		children,
		count,
		total,
	}: React.PropsWithChildren<{ count: number; total: number | null }>) => (
		<footer data-testid="footer">
			{children}
			<output>
				{count} of {String(total)}
			</output>
		</footer>
	),
}));
jest.mock('../cells/price', () => ({ Price: () => null }));
jest.mock('../cells/variation-image', () => ({ PosVariationImage: () => null }));
jest.mock('../cells/sku', () => ({ SKU: () => null }));
jest.mock('../cells/cogs', () => ({ COGS: () => null }));
jest.mock('../../../components/product/variation-image', () => ({
	ProductVariationImage: () => null,
}));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: String }),
}));
jest.mock('../../hooks/use-add-variation', () => ({ useAddVariation: () => ({ addVariation }) }));
const parent = {
	uuid: 'parent',
	payload: { name: 'Tea', variations: [1, 2] },
} as unknown as React.ComponentProps<typeof VariationsPane>['parent'];
beforeEach(() => {
	mockHandle = answeredWith();
	mockSkeletonMounts.value = 0;
	bind.mockClear();
	mockRegistry.on = false;
	mockRegistry.handles.clear();
	mockRegistry.created = [];
});
// React logs every error a boundary catches; these tests throw them on purpose.
let quiet: jest.SpyInstance | null = null;
function quietBoundaryLogs() {
	quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
}
afterEach(() => {
	quiet?.mockRestore();
	quiet = null;
});
// The stage's boundary above the pane, as a reader of what reached it.
function Boundary({ children }: React.PropsWithChildren) {
	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<>
					<output data-testid="boundary">{(error as Error).message}</output>
					<button data-testid="boundary-reset" onClick={() => resetErrorBoundary()} />
				</>
			)}
		>
			{children}
		</ErrorBoundary>
	);
}
it('scopes the query to published parent IDs, filters displayed stock and counts shown of parent total', () => {
	const { rerender } = render(<VariationsPane parent={parent} stockStatus="instock" />);
	expect(bind).toHaveBeenLastCalledWith(
		'variations',
		{ filters: { status: 'publish' } },
		{ remoteIds: ['1', '2'] }
	);
	expect(mockTableProps.value.handle).toBe(mockHandle);
	expect(screen.getByTestId('hits').textContent).toBe('one');
	expect(screen.getByTestId('footer').textContent).toContain('1 of 2');
	expect(screen.getByTestId('footer').textContent).toContain('pos_products.n_variations_of');
	rerender(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
	expect(screen.getByTestId('footer').textContent).toContain('2 of 2');
});
// The footer DataTable mounts must be ONE component identity: one made per render would remount
// the footer, and its sync button, every time the shown rows change.
it('keeps the same footer node across a count change: the footer is never remounted', () => {
	const { rerender } = render(<VariationsPane parent={parent} stockStatus="instock" />);
	const footer = screen.getByTestId('footer');
	expect(footer.textContent).toContain('1 of 2');
	rerender(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('footer')).toBe(footer);
	expect(footer.textContent).toContain('2 of 2');
	expect(footer.textContent).toContain('pos_products.n_variations_of');
});

it('adds a variation with exactly the old cell’s sanitised metadata', () => {
	const variation = {
		remoteId: 2,
		payload: { attributes: [null, { name: 'Size' }, { id: 1, name: 'Colour', option: 'Blue' }] },
	};
	const item = { original: { record: variation } } as unknown as React.ComponentProps<
		typeof VariationRow
	>['item'];
	render(<VariationRow item={item} parent={parent} />);
	fireEvent.click(screen.getByTestId('data-table-row-variation-2'));
	expect(addVariation).toHaveBeenCalledWith(variation, parent, [
		{ attr_id: 1, display_key: 'Colour', display_value: 'Blue' },
	]);
});
it('holds the skeleton, one row per variation, until the query has answered', () => {
	// Outside Suspense on purpose: a fallback React has committed stays up for 300 ms.
	mockHandle.set({ ready: false });
	render(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('skeleton').dataset.rows).toBe('2');
	expect(screen.queryByTestId('hits')).toBeNull();
	// The answer is heard from the handle itself, with no render from above.
	act(() => mockHandle.set({ ready: true }));
	expect(screen.queryByTestId('skeleton')).toBeNull();
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
});
it('commits no skeleton or fallback at all when the handle has answered by the first render', () => {
	render(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
	expect(mockSkeletonMounts.value).toBe(0);
});
it('keeps the table rows while a changed handle answers, then draws its answer', async () => {
	const { rerender } = render(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
	// A header sort is a new query: a new handle, unanswered.
	const sorted = fakeQueryHandle({ ready: false });
	mockHandle = sorted;
	await act(async () => rerender(<VariationsPane parent={parent} />));
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
	expect(screen.queryByTestId('skeleton')).toBeNull();
	expect(mockSkeletonMounts.value).toBe(0);
	await act(async () => sorted.set({ ready: true, result: { hits: [hits[1], hits[0]] } }));
	expect(screen.getByTestId('hits').textContent).toBe('two,one');
	expect(mockSkeletonMounts.value).toBe(0);
});
it('throws a failed first read on the table path into the boundary, not a skeleton for good', () => {
	quietBoundaryLogs();
	mockHandle.set({ ready: false });
	render(
		<Boundary>
			<VariationsPane parent={parent} />
		</Boundary>
	);
	expect(screen.getByTestId('skeleton')).not.toBeNull();
	// A failure counts as answered: the table's reader throws it.
	act(() => mockHandle.set({ error: new Error('variations read failed') }));
	expect(screen.getByTestId('boundary').textContent).toBe('variations read failed');
});
it('given a way back, hands the grid the answer itself and never a skeleton or a suspense fallback', () => {
	// A tile that suspended or was swapped for a skeleton mid-deal would lose its place.
	const back = jest.fn();
	mockHandle.set({ ready: false });
	render(<VariationsPane parent={parent} back={back} />);
	expect(screen.getByTestId('grid').textContent).toBe('unanswered');
	expect(screen.queryByTestId('skeleton')).toBeNull();
	act(() => mockHandle.set({ ready: true }));
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
	expect(screen.queryByTestId('hits')).toBeNull();
	expect(mockSkeletonMounts.value).toBe(0);
	fireEvent.click(screen.getByTestId('grid'));
	expect(back).toHaveBeenCalled();
});
it('throws a failed read on the grid path into the boundary instead of an empty grid', () => {
	quietBoundaryLogs();
	render(
		<Boundary>
			<VariationsPane parent={parent} back={jest.fn()} />
		</Boundary>
	);
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
	act(() => mockHandle.set({ error: new Error('variations read failed') }));
	expect(screen.queryByTestId('grid')).toBeNull();
	expect(screen.getByTestId('boundary').textContent).toBe('variations read failed');
});
it('keeps the dealt tiles while a changed handle answers, then lands the new hits', async () => {
	// A products pull moving the parent's variation list is a new key, so a new handle, which
	// starts its read only in the owner's effect: the tiles must not turn into placeholders.
	const back = jest.fn();
	const { rerender } = render(<VariationsPane parent={parent} back={back} />);
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
	const moved = fakeQueryHandle({ ready: false });
	mockHandle = moved;
	await act(async () => rerender(<VariationsPane parent={parent} back={back} />));
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
	await act(async () => moved.set({ ready: true, result: { hits: [hits[1]] } }));
	expect(screen.getByTestId('grid').textContent).toBe('two');
});
it('recovers from a failed read on the boundary’s reset: the remount reads a fresh handle', async () => {
	quietBoundaryLogs();
	mockRegistry.on = true;
	render(
		<Boundary>
			<VariationsPane parent={parent} back={jest.fn()} />
		</Boundary>
	);
	await act(async () => {});
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
	const failed = mockRegistry.created[0];
	act(() => failed.set({ error: new Error('variations read failed') }));
	expect(screen.getByTestId('boundary').textContent).toBe('variations read failed');
	// The fallback unmounted every holder: the key has left the registry.
	await act(async () => {});
	expect(failed.retained).toBe(0);
	await act(async () => fireEvent.click(screen.getByTestId('boundary-reset')));
	expect(screen.queryByTestId('boundary')).toBeNull();
	expect(mockRegistry.created).toHaveLength(2);
	expect(mockRegistry.created[1]).not.toBe(failed);
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
});
