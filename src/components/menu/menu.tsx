import * as React from 'react';
import snakeCase from 'lodash/snakeCase';
import { Item, ItemProps } from './item';
import * as Styled from './styles';

/**
 * Action with a Label.
 */
export interface TextAction {
	/**
	 * Label to display.
	 */
	label: string;
	/**
	 * Action to execute on click.
	 */
	action?: () => void;
	/**
	 * Color of menu item
	 */
	type?: import('@wcpos/common/src/themes').ColorTypes;
}

// export interface IconAction {
// 	/**
// 	 * Icon to display.
// 	 */
// 	icon: IconName;
// 	/**
// 	 * Color of the icon.
// 	 */
// 	color?: IconProps['color'];
// 	/**
// 	 * Action to execute on click.
// 	 */
// 	action?: () => void;
// }

// export type TextWithIconAction = TextAction & IconAction;
// export type TextWithOptionalIconAction = TextAction & Partial<IconAction>;

export interface MenuProps {
	/**
	 *
	 */
	items: (TextAction | string)[];
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
			{items.map((rawItem, index) => {
				const item = typeof rawItem === 'string' ? { label: rawItem } : rawItem;
				return (
					<Item
						key={snakeCase(`${item.label}_${index}`)}
						{...item}
						onPress={() => {
							onSelect(item);
						}}
					/>
				);
			})}
		</Styled.Container>
	);
};

export type MenuItemProps = ItemProps;
Menu.Item = Item;
