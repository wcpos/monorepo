import React from 'react';
import { View, Text } from 'react-native';
import Icon from '../../../components/icon';
import TableLayout from '../../../layout/table';

interface Props {}

const Products: React.FC<Props> = () => {
	return <TableLayout actions="Actions" table="Table" footer="Footer" />;
};

export default Products;
