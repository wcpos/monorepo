import React from 'react';
import Table from '../../components/table';
import Button from '../../components/button';
import Text from '../../components/text';
import { Name } from '../../components/format';

interface Props {
  // database: any;
  orders: any[];
  // deleteRecord: () => void;
  // search: string;
  // sort: () => void;
  // sortBy: string;
  // sortDirection: 'asc' | 'desc';
  // columns: any;
}

const columns = [
  {
    key: 'status',
    label: 'Status',
    width: '10%',
  },
  {
    key: 'number',
    label: 'Order Number',
    width: '10%',
  },
  {
    key: 'customer',
    label: 'Customer',
    flexGrow: 1,
    cellRenderer: ({ rowData }: any) => (
      <Text>
        <Name firstName={rowData.billing.first_name} lastName={rowData.billing.last_name} />
      </Text>
    ),
  },
  {
    key: 'note',
    label: 'Note',
    width: '10%',
  },
  {
    key: 'date_created',
    label: 'Date Created',
    flexGrow: 1,
  },
  {
    key: 'date_modified',
    show: false,
    label: 'Date Modified',
    width: '10%',
  },
  {
    key: 'date_completed',
    show: false,
    label: 'Date Completed',
    width: '10%',
  },
  {
    key: 'total',
    label: 'Total',
    width: '10%',
  },
  {
    key: 'actions',
    label: 'Actions',
    disableSort: true,
    width: '10%',
    cellRenderer: ({ rowData }: any) => (
      <Button
        title="Show"
        onPress={() => {
          console.log(rowData);
        }}
      />
    ),
  },
];

const OrdersTable = ({
  orders,
  // columns,
  // sort,
  // sortBy,
  // sortDirection,
  ...props
}: Props) => {
  return (
    <Table
      items={orders}
      // @ts-ignore
      columns={columns}
      // sort={sort}
      // sortBy={sortBy}
      // sortDirection={sortDirection}
    />
  );
};

export default OrdersTable;
