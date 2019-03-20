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
		const key = keyExtractor(item);
		return item[key];
	};

	return (
		<ListView>
			{items.map((item, index) =>
				props.renderItem ? (
					props.renderItem(item)
				) : (
					<ListItem key={item.key} text={renderText(item)} onPress={onItemPress} />
				)
			)}
		</ListView>
	);
};

export default List;
