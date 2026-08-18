import type {
	CellData,
	RowData,
	TableFeatures,
	Cell as TanStackCell,
	CellContext as TanStackCellContext,
	Column as TanStackColumn,
	ColumnDef as TanStackColumnDef,
	Header as TanStackHeader,
	HeaderContext as TanStackHeaderContext,
	Row as TanStackRow,
	Table as TanStackTable,
} from '@tanstack/react-table';

export type Cell<
	TData extends RowData,
	TValue extends CellData = CellData,
	TFeatures extends TableFeatures = {},
> = TanStackCell<TFeatures, TData, TValue>;
export type CellContext<
	TData extends RowData,
	TValue extends CellData = CellData,
	TFeatures extends TableFeatures = {},
> = TanStackCellContext<TFeatures, TData, TValue>;
export type Column<
	TData extends RowData,
	TValue extends CellData = CellData,
	TFeatures extends TableFeatures = {},
> = TanStackColumn<TFeatures, TData, TValue>;
export type ColumnDef<
	TData extends RowData,
	TValue extends CellData = CellData,
	TFeatures extends TableFeatures = {},
> = TanStackColumnDef<TFeatures, TData, TValue>;
export type Header<
	TData extends RowData,
	TValue extends CellData = CellData,
	TFeatures extends TableFeatures = {},
> = TanStackHeader<TFeatures, TData, TValue>;
export type HeaderContext<
	TData extends RowData,
	TValue extends CellData = CellData,
	TFeatures extends TableFeatures = {},
> = TanStackHeaderContext<TFeatures, TData, TValue>;
export type Row<TData extends RowData, TFeatures extends TableFeatures = {}> = TanStackRow<
	TFeatures,
	TData
>;
export type Table<TData extends RowData, TFeatures extends TableFeatures = {}> = TanStackTable<
	TFeatures,
	TData
>;

/**
 * Augment @tanstack/react-table's ColumnMeta interface with
 * the custom properties used in this project's data-table components.
 */
declare module '@tanstack/react-table' {
	interface ColumnMeta<
		in out TFeatures extends TableFeatures,
		in out TData extends RowData,
		TValue extends CellData = CellData,
	> {
		/** Fixed column width (disables flex growth when set). */
		width?: number;
		/** Flex grow factor for the column (defaults to 1 when width is not set). */
		flex?: number;
		/** Text / content alignment inside the column. */
		align?: 'left' | 'right' | 'center';
		/** When true the column header label is hidden. */
		hideLabel?: boolean;
		/** Visibility helper used by some column configs. */
		show?: (key: string) => boolean;
	}
}
