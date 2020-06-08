import { ReactNode } from 'react';
import { NativeSyntheticEvent, NativeTouchEvent } from 'react-native';

export interface CellRendererProps {
	cellData: any;
	dataKey: string | number;
	rowData: any;
}

export type CellRenderer = (props: CellRendererProps) => ReactNode;

// export interface HeaderCellRendererProps {
// 	dataKey: string | number;
// }

// export type HeaderCellRenderer = (props: HeaderCellRendererProps) => ReactNode;

export interface CellDataGetterProps {
	rowData: any;
	dataKey: string | number;
	column: ColumnProps;
}

export type CellDataGetter = (props: CellDataGetterProps) => any;

export interface ColumnProps {
	key: string;
	label: string;
	headerCellRenderer?: HeaderCellRenderer;
	hide?: boolean;
	disableSort?: boolean;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
	cellRenderer?: CellRenderer;
	cellDataGetter?: CellDataGetter;
	defaultSortDirection?: SortDirection;
}

export type SortDirection = 'asc' | 'desc';

export interface SortProps {
	defaultSortDirection?: SortDirection;
	event: NativeSyntheticEvent<NativeTouchEvent>;
	sortBy: string | number;
	sortDirection?: SortDirection;
}

export type Sort = (props: SortProps) => void;
