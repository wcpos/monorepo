import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import TabItem from './tab-item';

export interface TabBarProps {
	routes: import('./tabs').Route[];
	onIndexChange: (index: number) => void;
	direction?: 'horizontal' | 'vertical';
	focusedIndex: number;
}

const TabBar = ({ routes, onIndexChange, direction = 'horizontal', focusedIndex }: TabBarProps) => {
	return (
		<Box horizontal={direction === 'horizontal'}>
			{routes.map((route, i) => {
				const focused = i === focusedIndex;
				return (
					<TabItem
						key={route.key}
						title={route.title}
						onPress={() => onIndexChange(i)}
						focused={focused}
					/>
				);
			})}
		</Box>
	);
};

export default TabBar;
