import React, { Fragment } from 'react';
import Input from '../../components/textinput';
import Button from '../../components/button';
import { syncCustomers } from '../../actions/customer';

interface Props {
	onSearch: any;
}

const Actions = ({ onSearch }: Props) => {
	return (
		<Fragment>
			<Input placeholder="Search customers" onChangeText={onSearch} />
			<Button title="Sync" onPress={() => syncCustomers()} />
		</Fragment>
	);
};

export default Actions;
