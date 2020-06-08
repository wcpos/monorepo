import React from 'react';
import * as Styled from './styles';
import HeaderCell from './header-cell';

export type Props = {
	children?: React.ReactNode;
	columns?: import('./types').ColumnProps[];
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
};

const HeaderRow: React.FC<Props> = ({ columns, sort, sortBy, sortDirection, children }) => {
	// return (
	const h = (
		<Styled.HeaderRow>
			{children ||
				(columns &&
					columns.map((column, index) => {
						const dataKey = column.key || index;
						const {
							defaultSortDirection,
							disableSort,
							headerCellRenderer,
							label,
							flexGrow,
							flexShrink,
							width,
						} = column;

						return (
							!column.hide && (
								<HeaderCell
									dataKey={dataKey}
									defaultSortDirection={defaultSortDirection}
									flexGrow={flexGrow}
									flexShrink={flexShrink}
									// headerCellRenderer={headerCellRenderer}
									key={dataKey}
									label={label}
									sort={disableSort ? undefined : sort}
									sortBy={sortBy}
									sortDirection={sortDirection}
									width={width}
								/>
							)
						);
					}))}
		</Styled.HeaderRow>
	);
	// );
	console.log(h);
	return h;
};

export default Object.assign(HeaderRow, { HeaderCell });
