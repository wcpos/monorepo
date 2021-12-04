import * as React from 'react';
import { View, Text } from 'react-native';
import { StoryWrapper } from '@storybook/addons';
import { action } from '@storybook/addon-actions';
import { Popover, PopoverProps } from './popover';
import Portal from '../portal';
import Pressable from '../pressable';
import { usePopover } from './use-popover';

/**
 * Popovers require
 * - Portals
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<Portal.Provider>
			<Story {...context} />
			<Portal.Manager />
		</Portal.Provider>
	);
};

export default {
	title: 'Components/Popover4',
	component: Popover,
	decorators: [AppProvider],
};

export const BasicUsage = (props: PopoverProps) => {
	return (
		<View style={{ height: 600, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
			<Popover
				{...props}
				content={
					<View style={{ backgroundColor: 'white', width: 200, height: 200 }}>
						<Text>Content</Text>
					</View>
				}
			>
				<View style={{ width: 60, height: 60 }}>
					<Text>Trigger</Text>
				</View>
			</Popover>
		</View>
	);
};

// export const UsePopover = () => {
// 	const { ref } = usePopover();

// 	return (
// 		<Pressable ref={ref} onPress={() => action('Trigger press')}>
// 			<Text>Trigger</Text>
// 		</Pressable>
// 	);
// };
