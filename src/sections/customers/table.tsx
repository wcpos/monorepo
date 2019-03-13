import React from 'react';
import Table from '../../components/table';
import Button from '../../components/button';
import Img from '../../components/image';

interface Props {
  customers: any;
}

const CustomersTable = ({ customers }: Props) => {
  return (
    <Table
      items={customers || []}
      columns={[
        {
          key: 'avatar_url',
          label: '',
          disableSort: true,
          cellRenderer: ({ cellData }: any) => (
            <Img source={cellData} style={{ width: 100, height: 100 }} />
          ),
        },
        { key: 'first_name', label: 'First Name' },
        { key: 'last_name', label: 'Last Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { key: 'username', label: 'Username' },
        { key: 'billing', label: 'Billing Address' },
        { key: 'shipping', label: 'Shipping Address' },
        {
          key: 'actions',
          label: 'Actions',
          disableSort: true,
          cellRenderer: ({ rowData }: any) => (
            <Button
              title="Show"
              onPress={() => {
                console.log(rowData);
              }}
            />
          ),
        },
      ]}
    />
  );
};

export default CustomersTable;
