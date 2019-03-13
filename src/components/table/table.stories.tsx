import React from 'react';
import { action } from '@storybook/addon-actions';
// import { text, select, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Table from './';

storiesOf('Table', module)
  /**
   *
   */
  .add('basic usage', () => (
    <Table
      columns={[
        { key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
        { key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
        { key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
      ]}
      items={[
        { name: 'Apples', price: 1.29, quantity: 2 },
        { name: 'Pears', price: 3.1, quantity: 0 },
        { name: 'Oranges', price: 0.99, quantity: 44 },
      ]}
      sort={action('sort')}
      sortBy="name"
      sortDirection="asc"
    />
  ));
