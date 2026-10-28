/**
 * Pull in the @tanstack/react-table module augmentation from @wcpos/components
 * so that ColumnMeta extensions (width, flex, align, hideLabel, show) are available
 * throughout the core package.
 */
import '@wcpos/components/data-table/types';

import type { ElementType } from 'react';

import type { EngineRecord } from '@wcpos/query';
import type { CollectionKey, FiltersOf, VariationMatch } from '@wcpos/query/query-state';

import type { Observable } from 'rxjs';
import type {
	ExpandedState,
	RowData,
	TableFeatures,
	Row as TanStackRow,
} from '@tanstack/react-table';

export type {
	Cell,
	CellContext,
	Column,
	ColumnDef,
	Header,
	HeaderContext,
	Row,
	Table,
} from '@wcpos/components/data-table/types';

/** A filter a list's cell can set: a field of one of the lists, and that field's value. */
export type FilterField = { [C in CollectionKey]: keyof FiltersOf<C> }[CollectionKey];
export type FilterValue<F> = {
	[C in CollectionKey]: F extends keyof FiltersOf<C> ? FiltersOf<C>[F] : never;
}[CollectionKey];

/** A cell's edit to the record its row carries (`row.original.record`). */
type RowRecord<TData> = TData extends { record: infer TRecord } ? TRecord : never;
type RecordChange<TData> = { document: RowRecord<TData>; changes: Record<string, unknown> };

/** The one contract a cell reads from `table.options.meta`: a table hands only what its cells read. */
declare module '@tanstack/react-table' {
	interface TableMeta<in out TFeatures extends TableFeatures, in out TData extends RowData> {
		/** DataTable's query actions: a cell's chip or badge filters the list by its value. */
		actions?: { setFilter<F extends FilterField>(field: F, value: FilterValue<F>): void };
		/** Writes a cell's edit to its row's record; resolves whether it saved (a refusal is toasted). */
		commit?(change: RecordChange<TData>): void | Promise<boolean>;
		/** A products list: which variable rows are open, and the bypass of TanStack's expand updater. */
		expanded$?: Observable<ExpandedState>;
		setRowExpanded?: (id: string, expanded: boolean) => void;
		/** The drill style: the variations button and an attribute chip open the pane instead. */
		drill?(row: TanStackRow<TFeatures, TData>, match?: VariationMatch): void;
		openVariation?: (record: EngineRecord<'variations'>) => void;
		/** The cell a variation sub-row draws for the parent's column (a cell as DataTable's `cells`). */
		variationRenderCell?(cell: { column: { id: string } }): ElementType | undefined;
		/** The list's Stock Status filter, which the expanded variation rows answer to. */
		variationStockStatus?: string;
		/** The cart: brings a line into view. */
		scrollToRow?: (uuid: string) => void;
	}
}
