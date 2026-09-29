import * as React from 'react';

import { render } from '@testing-library/react';
import { of } from 'rxjs';

import { DataTable } from './index';
import { QueryStateProvider } from '../../../../../query';

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
export const pans: { begin?: () => void; end?: (event: { translationX: number }) => void }[] = [];
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => state.pointer }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, selector: (value: unknown) => unknown) =>
		selector({ columns: state.columns }),
}));
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => state.result,
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
jest.mock('../../sync-button', () => ({ SyncButton: () => null }));
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
	}: {
		data: unknown[];
		renderItem: (value: { item: unknown; index: number }) => React.ReactNode;
		ListEmptyComponent: React.ComponentType;
	}) => (
		<div>
			{data.length ? (
				data.map((item, index) => (
					<React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>
				))
			) : (
				<ListEmptyComponent />
			)}
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
export function renderTable(overrides: Record<string, unknown> = {}) {
	return render(
		<QueryStateProvider
			collection="products"
			initialPageSize={1}
			initialSort={{ field: 'name', direction: 'asc' }}
		>
			<DataTable
				id="pos-products"
				collectionName="products"
				resource={{} as React.ComponentProps<typeof DataTable>['resource']}
				sort={{ field: 'name', direction: 'asc' }}
				actions={{ setSort, extendLimit: jest.fn(), setFilter: jest.fn() }}
				active$={of(false)}
				total$={of(null)}
				sync={jest.fn()}
				{...overrides}
			/>
		</QueryStateProvider>
	);
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
