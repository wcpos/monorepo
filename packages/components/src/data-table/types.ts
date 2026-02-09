import type { RowData } from '@tanstack/react-table';

/**
 * Augment @tanstack/react-table's ColumnMeta interface with
 * the custom properties used in this project's data-table components.
 */
declare module '@tanstack/react-table' {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ColumnMeta<TData extends RowData, TValue> {
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

/**
 * Base shape that TData must satisfy when used with the built-in
 * DataTable component (which accesses row.id and row.document).
 */
export interface DataTableRowData {
	id: string;
	document: { type: string; [key: string]: unknown };
}
