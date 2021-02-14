import * as React from 'react';
import { MenuItemText } from './styles';

interface Props {
	label: string;
}

const Item = ({ label }: Props) => {
	return <MenuItemText>{label}</MenuItemText>;
};

export default Item;
