import * as React from 'react';

import { render } from '@testing-library/react';

import type { QueryHandle } from '@wcpos/query';

import { DataTable } from './index';
import { QueryStateProvider } from '../../../../../query';

const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
export type FakeHandle = QueryHandle & { set(partial: Record<string, unknown>): void };
/** A handle answered with `state.result` (and any other snapshot fields), driven by `set`. */
export function handleWith(snapshot: Record<string, unknown> = {}): FakeHandle {
	return fakeQueryHandle({ result: state.result, ...snapshot });
}

export const state = {
	pointer: 'fine',
	columns: [
		{ key: 'name', show: true, width: 120 },
		{ key: 'price', show: true, width: 80 },
		{ key: 'actions', show: true, width: 48 },
	],
	result: {
		hits: [{ id: 'hit-1', record: { uuid: 'uuid-1', payload: { name: 'Tea' } } }],
		searchActive: false,
		searchState: 'answered',
	},
};
export const patchUI = jest.fn();
export const setSort = jest.fn();
export const extendLimit = jest.fn();
export const setFilter = jest.fn();
export const pans: { begin?: () => void; end?: (event: { translationX: number }) => void }[] = [];
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => state.pointer,
	// The surface the table stands on asks; these tests are about the table, on a wide window.
	useIsPhone: () => false,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, selector: (value: unknown) => unknown) =>
		selector({ columns: state.columns }),
}));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, getUILabel: (key: string) => key, patchUI }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? JSON.stringify({ key, ...values }) : key,
}));
jest.mock('../../../hooks/use-collection-reset', () => ({
	useCollectionReset: () => ({ clearAndSync: jest.fn() }),
}));
jest.mock('../../sync-button', () => ({
	// The footer's sync control as the cashier sees it: it turns while `active`, a press syncs.
	SyncButton: ({ active, sync }: { active: boolean; sync: () => Promise<void> }) => (
		<button data-testid="sync-button" data-active={String(active)} onClick={() => void sync()} />
	),
}));
jest.mock('../list-footer', () => ({ ListFooterComponent: () => null }));
jest.mock('../../record-text-cell', () => ({
	RecordTextCell: ({ column }: { column: { id: string } }) => (
		<span data-testid={`cell-${column.id}`}>{column.id}</span>
	),
}));
jest.mock('@wcpos/components/table', () => {
	const { View } = jest.requireActual('react-native');
	return {
		Table: (props: object) => <View {...props} role="table" />,
		TableHeader: View,
		TableHead: View,
		TableRow: View,
		TableCell: View,
		TableBody: View,
		TableFooter: View,
	};
});
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/sort-icon', () => ({ SortIcon: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({
	TooltipPassiveTriggers: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => (
		<React.Suspense>{children}</React.Suspense>
	),
}));
jest.mock('@wcpos/components/skeleton', () => ({
	...jest.requireActual('@wcpos/components/skeleton'),
	Skeleton: ({ testID, shape }: { testID: string; shape: string }) => (
		<div data-testid={testID} data-shape={shape} />
	),
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	List: ({
		data,
		renderItem,
		ListEmptyComponent,
		ListFooterComponent,
		onEndReached,
	}: {
		data: unknown[];
		renderItem: (value: { item: unknown; index: number }) => React.ReactNode;
		ListEmptyComponent: React.ComponentType;
		ListFooterComponent?: React.ComponentType;
		onEndReached?: () => void;
	}) => (
		<div>
			{data.length ? (
				data.map((item, index) => (
					<React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>
				))
			) : (
				<ListEmptyComponent />
			)}
			{ListFooterComponent ? <ListFooterComponent /> : null}
			<button data-testid="end-reached" onClick={onEndReached} />
		</div>
	),
}));
jest.mock('react-native-gesture-handler', () => ({
	GestureDetector: ({ children }: { children: React.ReactNode }) => children,
	Gesture: {
		Pan: () => {
			const handlers: (typeof pans)[number] = {};
			pans.push(handlers);
			const pan = {
				runOnJS: () => pan,
				onBegin: (fn: () => void) => {
					handlers.begin = fn;
					return pan;
				},
				onEnd: (fn: (event: { translationX: number }) => void) => {
					handlers.end = fn;
					return pan;
				},
			};
			return pan;
		},
	},
}));

export function reset() {
	jest.clearAllMocks();
	pans.length = 0;
	state.pointer = 'fine';
	state.columns = [
		{ key: 'name', show: true, width: 120 },
		{ key: 'price', show: true, width: 80 },
		{ key: 'actions', show: true, width: 48 },
	];
	state.result = {
		hits: [{ id: 'hit-1', record: { uuid: 'uuid-1', payload: { name: 'Tea' } } }],
		searchActive: false,
		searchState: 'answered',
	};
}
/**
 * The table under a query-state provider over a handle (`overrides.handle`, or one answered with
 * `state.result`); `renderTable` renders it, a test can rerender it.
 */
export function tableTree(overrides: Record<string, unknown> = {}) {
	return (
		<QueryStateProvider
			collection="products"
			initialPageSize={1}
			initialSort={{ field: 'name', direction: 'asc' }}
		>
			<DataTable
				id="pos-products"
				collectionName="products"
				handle={handleWith()}
				sort={{ field: 'name', direction: 'asc' }}
				actions={{ setSort, extendLimit, setFilter }}
				{...overrides}
			/>
		</QueryStateProvider>
	);
}
export function renderTable(overrides: Record<string, unknown> = {}) {
	return render(tableTree(overrides));
}

// Native shared values are event-owned here; preserve their identity across rerenders.
jest.mock('react-native-reanimated', () => ({
	useSharedValue: (initial: number) =>
		React.useState(() => {
			let value = initial;
			return {
				get: () => value,
				set: (next: number) => {
					value = next;
				},
			};
		})[0],
}));
