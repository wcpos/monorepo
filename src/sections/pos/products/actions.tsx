import React, { Fragment } from 'react';
import Input from '../../../components/textinput';

interface Props {
	onSearch: any;
}

const Actions = ({ onSearch }: Props) => {
	return (
		<Fragment>
			<Input placeholder="Search products" onChangeText={onSearch} />
		</Fragment>
	);
};

export default Actions;
