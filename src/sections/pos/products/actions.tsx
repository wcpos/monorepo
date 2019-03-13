import React from 'react';
import Input from '../../../components/input';

interface Props {
	onSearch: any;
}

const Actions = ({ onSearch }: Props) => {
	return <Input placeholder="Search products" onChangeText={onSearch} />;
};

export default Actions;
