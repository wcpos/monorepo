import React from 'react';
import ListItem from './list-item';
import { ListView } from './styles';

type Item = any;

type Props = {
	// activeItemKey: string;
	items: Item[];
	onItemPress?: () => void;
	keyExtractor?: (item: Item) => string;
	renderItem?: (item: Item) => React.ReactElement;
};

const List = ({ activeItemKey, items, onItemPress, keyExtractor, ...props }: Props) => {
	const renderText = (item: Item) => {
		if (typeof keyExtractor === 'function') {
			const key = keyExtractor(item);
			return item[key];
		}
		return String(item);
	};

	return (
		<ListView>
			{items.map((item, index) =>
				props.renderItem ? (
					props.renderItem(item)
				) : (
					<ListItem
						key={item.key || index}
						text={renderText(item)}
						onPress={onItemPress}
						icon={item.icon}
					/>
				)
			)}
		</ListView>
	);
};

export default List;
