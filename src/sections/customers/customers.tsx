import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import Segment, { SegmentGroup } from '../../components/segment';
import Text from '../../components/text';
import Table from './table';
import Actions from './actions';

const Customers = () => {
  const [search, setSearch] = useState('');
  const database = useDatabase();

  const customers = useObservable(
    () =>
      database.collections
        .get('customers')
        // TODO: query works on last_name as well?
        .query(Q.where('first_name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
        .observeWithColumns(['first_name', 'last_name']),
    []
  );

  return (
    <SegmentGroup>
      <Segment>
        <Actions onSearch={setSearch} />
      </Segment>
      <Segment>
        {customers && customers.length > 0 ? (
          <Table customers={customers} />
        ) : (
          <Text>No customers found</Text>
        )}
      </Segment>
      <Segment content={customers && customers.length} />
    </SegmentGroup>
  );
};

export default Customers;
