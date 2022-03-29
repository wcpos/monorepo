import * as React from 'react';
import { StyleProp, ViewStyle, View, Text, Pressable } from 'react-native';
import Box from '@wcpos/common/src/components/box';
import TabBar from './tab-bar';

export type Route = {
	key: string;
	// icon?: string;
	title: string | ((props: { focused: boolean }) => React.ReactNode);
};

export type NavigationState<T extends Route> = {
	index: number;
	routes: T[];
};

export type TabsProps<T extends Route> = {
	onIndexChange: (index: number) => void;
	navigationState: NavigationState<T>;
	renderScene: (props: { route: T }) => React.ReactNode;
	renderLazyPlaceholder?: (props: { route: T }) => React.ReactNode;
	renderTabBar?: (props: { navigationState: NavigationState<T> }) => React.ReactNode;
	tabBarPosition?: 'top' | 'bottom' | 'left' | 'right';
	// initialLayout?: Partial<Layout>;
	// lazy?: ((props: { route: T }) => boolean) | boolean;
	// lazyPreloadDistance?: number;
	sceneContainerStyle?: StyleProp<ViewStyle>;
	style?: StyleProp<ViewStyle>;
};

/**
 *
 */
export const Tabs = <T extends Route>({
	onIndexChange,
	navigationState,
	renderScene,
	tabBarPosition = 'top',
	style,
}: TabsProps<T>) => {
	return (
		<Box
			horizontal={tabBarPosition === 'left' || tabBarPosition === 'right'}
			reverse={tabBarPosition === 'bottom' || tabBarPosition === 'right'}
			style={style}
		>
			<TabBar
				routes={navigationState.routes}
				onIndexChange={onIndexChange}
				direction={
					tabBarPosition === 'left' || tabBarPosition === 'right' ? 'vertical' : 'horizontal'
				}
				focusedIndex={navigationState.index}
			/>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				{renderScene({ route: navigationState.routes[navigationState.index] })}
			</Box>
		</Box>
	);
};
