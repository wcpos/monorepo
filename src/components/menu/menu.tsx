import * as React from 'react';
import { Wrapper } from './styles';
import Item from './item';

export type Props = {
	items: any[];
};

const Menu = ({ items }) => {
	return (
		<Wrapper>
			{items.map((item, index) => (
				<Item key={index} {...item} />
			))}
		</Wrapper>
	);
};

export default Menu;
