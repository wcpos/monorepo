import * as React from 'react';
import { Item, ItemProps } from './item';
import * as Styled from './styles';

export interface MenuProps {
	/**
	 *
	 */
	items: any[];
	/**
	 *
	 */
	onSelect?: (value: any) => void;
}

export const Menu: React.FC<MenuProps> & { Item: typeof Item } = ({
	items,
	// @ts-ignore
	onSelect = () => {},
}) => {
	return (
		<Styled.Container>
			{items.map((item, index) =>
				typeof item === 'string' ? (
					<Item
						onPress={() => {
							onSelect(item);
						}}
					>
						{item}
					</Item>
				) : (
					<Item
						{...item}
						onPress={() => {
							onSelect(item);
						}}
					/>
				)
			)}
		</Styled.Container>
	);
};

export type MenuItemProps = ItemProps;
Menu.Item = Item;
