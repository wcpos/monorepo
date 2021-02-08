import * as React from 'react';
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
	return (
		<ListView>
			{items.map((item, index) => {
				const key = keyExtractor(item);

				return props.renderItem ? (
					props.renderItem(item)
				) : (
					<ListItem
						key={item[key] || index}
						label={item[key] || String(item)}
						onPress={onItemPress}
						icon={item.icon}
						info={item.info}
						action={item.action}
					/>
				);
			})}
		</ListView>
	);
};

export default List;
