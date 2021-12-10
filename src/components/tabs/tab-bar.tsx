import * as React from 'react';
import { StyleProp, ViewStyle, View, Text, Pressable } from 'react-native';
import TabItem from './tab-item';

export interface TabBarProps {
	routes: import('./tabs').Route[];
	onIndexChange: (index: number) => void;
	direction?: 'horizontal' | 'vertical';
	focusedIndex: number;
}

const TabBar = ({ routes, onIndexChange, direction = 'horizontal', focusedIndex }: TabBarProps) => {
	return (
		<View style={{ flexDirection: direction === 'vertical' ? 'column' : 'row' }}>
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
		</View>
	);
};

export default TabBar;
