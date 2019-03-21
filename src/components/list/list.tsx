import React from 'react';
import ListItem from './list-item';
import { ListView } from './styles';

type Item = any;

type Props = {
	activeItemKey?: string;
	items: Item[];
	onItemPress?: () => void;
	keyExtractor?: (item: Item) => string;
	renderItem?: (item: Item) => React.ReactElement;
};

const List = ({
	activeItemKey,
	items,
	onItemPress,
	keyExtractor = () => 'label',
	...props
}: Props) => {
	const renderLabel = (item: Item) => {
		const key = keyExtractor(item);
		return item[key] || String(item);
	};

	return (
		<ListView>
			{items.map((item, index) =>
				props.renderItem ? (
					props.renderItem(item)
				) : (
					<ListItem
						key={item.key || index}
						label={renderLabel(item)}
						onPress={onItemPress}
						icon={item.icon}
						info={item.info}
						action={item.action}
					/>
				)
			)}
		</ListView>
	);
};

export default List;
