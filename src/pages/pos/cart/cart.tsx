import React from 'react';
import TableLayout from '../../../layout/table';

interface Props {}

const Cart: React.FC<Props> = ({ header, main, title }) => {
	return <TableLayout actions="Actions" table="Table" footer="Footer" />;
};

export default Cart;
