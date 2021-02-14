import * as React from 'react';
import { Wrapper } from './styles';
import Item from './item';

interface Props {
	items: any[];
};

const Menu = ({ items }: Props) => {
	return (
		<Wrapper>
			{items.map((item, index) => (
				<Item key={index} {...item} />
			))}
		</Wrapper>
	);
};

export default Menu;
