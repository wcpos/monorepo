import * as React from 'react';
import { NativeSyntheticEvent, NativeTouchEvent, ViewStyle, StyleProp } from 'react-native';

import { LoadingRow } from './loading';
import Row from './row';
import Table from './table';
export { useTable } from './context';

export default Object.assign(Table, { Row, LoadingRow });

/**
 * Types
 */
export type { TableProps } from './table';

export type SortDirection = 'asc' | 'desc';

export interface SortProps {
	defaultSortDirection?: SortDirection;
	event: NativeSyntheticEvent<NativeTouchEvent>;
	sortBy: string | number;
	sortDirection?: SortDirection;
}

export type Sort = (props: SortProps) => void;

export interface DisplayProps<T = any> {
	key: keyof T & string;
	show?: boolean;
}

export interface ColumnProps<T = any> {
	key: keyof T & string;
	label?: string;
	show?: boolean;
	disableSort?: boolean;
	hideLabel?: boolean;
	flex?: StyleProp<ViewStyle['flex']>;
	width?: string;
	defaultSortDirection?: SortDirection;
	align?: 'left' | 'center' | 'right';
	display?: DisplayProps<T>[];
}

export interface CellRendererProps<T> {
	item: T;
	column: ColumnProps<T>;
	index: number;
}

export type CellRenderer<T> = (props: CellRendererProps<T>) => React.ReactNode;

export interface TableContextProps<T> {
	columns: import('./').ColumnProps<T>[];
	sort?: import('./').Sort;
	sortBy?: keyof T & string;
	sortDirection?: import('./').SortDirection;
	cellRenderer: CellRenderer<T>;
	taxLocation?: 'pos' | 'base';
}
