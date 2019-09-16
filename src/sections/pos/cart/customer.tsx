import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Select from '../../../components/select';

interface Props {
	order?: any;
}

const Customer = ({ order }: Props) => {
	// const [search, setSearch] = useState('');

	const handleItemSelect = (item: any) => {
		if (order) {
			order.setCustomer(item);
		} else {
			console.log('set default customer for next order', item);
		}
	};

	return <Select placeholder="Select Customer" options={[]} onSelect={handleItemSelect} />;
};

export default Customer;
