import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Dropdown from '../../../components/dropdown';

interface Props {
	order?: any;
}

const Customer = ({ order }: Props) => {
	const [search, setSearch] = useState('');
	const { storeDB } = useDatabase();
	const customers = useObservable(
		storeDB.collections
			.get('customers')
		// TODO: query works on last_name as well?
			.query(Q.where('first_name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
			.observe(),
		[]
	);

	const handleItemSelect = (item: any) => {
		if (order) {
			order.setCustomer(item);
		} else {
			console.log('set default customer for next order', item);
		}
	};

	return (
		<Dropdown
			//@ts-ignore
			onTextChange={setSearch}
			onItemSelect={handleItemSelect}
			containerStyle={{ padding: 5 }}
			textInputStyle={{
				padding: 12,
				borderWidth: 1,
				borderColor: '#ccc',
				borderRadius: 5,
			}}
			itemStyle={{
				padding: 10,
				marginTop: 2,
				backgroundColor: '#ddd',
				borderColor: '#bbb',
				borderWidth: 1,
				borderRadius: 5,
			}}
			itemTextStyle={{ color: '#222' }}
			itemsContainerStyle={{ maxHeight: 140 }}
			items={customers}
			defaultIndex={2}
			placeholder="placeholder"
			resetValue={false}
			underlineColorAndroid="transparent"
		/>
	);
};

export default Customer;
