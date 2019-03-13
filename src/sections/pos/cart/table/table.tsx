import React, { useState } from 'react';
import orderBy from 'lodash/orderBy';
import useObservable from '../../../../hooks/use-observable';
import Table from '../../../../components/table';
import { Number } from '../../../../components/format';
import Quantity from './quantity';
import Actions from './actions';

interface Props {
  line_items: any;
}

const CartTable = ({ line_items }: Props) => {
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  const sort = ({ sortBy, sortDirection }: any) => {
    setSortBy(sortBy);
    setSortDirection(sortDirection);
  };

  const items = useObservable(
    line_items.observeWithColumns(['quantity', 'name', 'total']),
    [],
    [line_items]
  );

  // @ts-ignore
  const sortedItems = orderBy(items, [sortBy, 'id'], [sortDirection, 'asc']);

  return (
    <Table
      items={sortedItems || []}
      columns={[
        {
          key: 'quantity',
          label: 'Qty',
          cellRenderer: ({ rowData }: any) => <Quantity line_item={rowData} />,
        },
        { key: 'name', label: 'Name' },
        { key: 'total', label: 'Total' },
        {
          key: 'calculatedTotal',
          label: 'calcTotal',
          cellRenderer: ({ cellData }: any) => (
            <Number prefix="$" decimalSeparator=",">
              {cellData}
            </Number>
          ),
        },
        {
          key: 'actions',
          label: 'Actions',
          cellRenderer: ({ rowData }: any) => <Actions item={rowData} />,
        },
      ]}
      sort={sort}
      sortBy={sortBy}
      // @ts-ignore
      sortDirection={sortDirection}
    />
  );
};

export default CartTable;

// const enhance = withObservables(['line_items'], ({ line_items }: any) => ({
//   line_items: line_items.observeWithColumns(['quantity', 'name', 'total']),
// }));

// export default enhance(CartTable);
