import React from 'react';
import * as Styled from './styles';
import HeaderCell from './header-cell';

export type Props = {
	children?: React.ReactNode;
	columns?: import('./types').ColumnProps[];
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: import('react-native').ViewStyle;
};

const HeaderRow: React.FC<Props> = ({ columns, sort, sortBy, sortDirection, children, style }) => {
	return (
		<Styled.HeaderRow style={style}>
			{columns &&
				columns.map((column, index) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const { defaultSortDirection, disableSort, label, flexGrow, flexShrink, width } = column;

					const getHeaderCellProps = () => ({
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
					});

					if (typeof children === 'function') {
						return children({ column, getHeaderCellProps });
					}

					return <HeaderCell {...getHeaderCellProps()} />;
				})}
		</Styled.HeaderRow>
	);
};

export default Object.assign(HeaderRow, { HeaderCell });
