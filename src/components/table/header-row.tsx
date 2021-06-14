import * as React from 'react';
import * as Styled from './styles';
import HeaderCell, { HeaderCellProps } from './header-cell';

type ColumnProps = import('./types').ColumnProps;
export type GetHeaderCellPropsFunction = () => HeaderCellProps & { column: ColumnProps };

/**
 *
 */
export interface HeaderRowProps {
	children?: React.ReactNode;
	columns?: import('./types').ColumnProps[];
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: import('react-native').ViewStyle;
}

/**
 *
 */
const HeaderRow = ({ columns, sort, sortBy, sortDirection, children, style }: HeaderRowProps) => {
	return (
		<Styled.HeaderRow>
			{columns &&
				columns.map((column, index) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const {
						defaultSortDirection,
						disableSort,
						label,
						flexGrow,
						flexShrink,
						flexBasis,
						width,
						hideLabel,
					} = column;

					const getHeaderCellProps: GetHeaderCellPropsFunction = () => ({
						column,
						dataKey,
						defaultSortDirection,
						disableSort,
						flexGrow,
						flexShrink,
						flexBasis,
						label,
						sort,
						sortBy,
						sortDirection,
						width,
						hideLabel,
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

/**
 * note: statics need to be added after React.memo
 */
const MemoizedHeaderRow = React.memo(HeaderRow) as unknown as React.FC<HeaderRowProps> & {
	Cell: typeof HeaderCell;
};
MemoizedHeaderRow.displayName = 'Table.Header.Row';
MemoizedHeaderRow.Cell = HeaderCell;

export default MemoizedHeaderRow;
