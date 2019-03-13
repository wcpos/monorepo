import React from 'react';
import { HeaderRow as StyledView } from './styles';
import Cell from './header-cell';
import { ColumnProps, Sort, SortDirection } from './';

type Props = {
  columns: ColumnProps[];
  sort?: Sort;
  sortBy?: string;
  sortDirection?: SortDirection;
};

const Header = ({ columns, sort, sortBy, sortDirection }: Props) => {
  return (
    <StyledView>
      {columns.map((column, index) => {
        const dataKey = column.key || index;
        const { defaultSortDirection, disableSort, label, flexGrow, flexShrink, width } = column;
        return (
          // column.show && (
          <Cell
            dataKey={dataKey}
            defaultSortDirection={defaultSortDirection}
            key={'Header-Col' + index}
            label={label}
            sort={disableSort ? undefined : sort}
            sortBy={sortBy}
            sortDirection={sortDirection}
            flexGrow={flexGrow}
            flexShrink={flexShrink}
            width={width}
          />
          // )
        );
      })}
    </StyledView>
  );
};

export default Header;
