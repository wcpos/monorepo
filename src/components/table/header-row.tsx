import * as React from 'react';
import * as Styled from './styles';
import { HeaderCell } from './header-cell';

type ColumnProps = import('./types').ColumnProps;
type IHeaderCellProps = import('./header-cell').IHeaderCellProps;
export type GetHeaderCellPropsFunction = () => IHeaderCellProps & { column: ColumnProps };

export interface IHeaderRowProps {
	children?: React.ReactNode;
	columns?: import('./types').ColumnProps[];
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: import('react-native').ViewStyle;
}

export const HeaderRow = ({
	columns,
	sort,
	sortBy,
	sortDirection,
	children,
	style,
}: IHeaderRowProps) => {
	return (
		<Styled.HeaderRow>
			{columns &&
				columns.map((column, index) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const { defaultSortDirection, disableSort, label, flexGrow, flexShrink, width } = column;

					const getHeaderCellProps: GetHeaderCellPropsFunction = () => ({
						column,
						dataKey,
						defaultSortDirection,
						disableSort,
						flexGrow,
						flexShrink,
						label,
						sort,
						sortBy,
						sortDirection,
						width,
						key: dataKey,
					});

					if (typeof children === 'function') {
						return children({ column, getHeaderCellProps });
					}

					return <HeaderCell {...getHeaderCellProps()} />;
				})}
		</Styled.HeaderRow>
	);
};

HeaderRow.HeaderCell = HeaderCell;
HeaderRow.displayName = 'Table.HeaderRow';
