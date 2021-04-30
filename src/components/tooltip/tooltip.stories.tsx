import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { StoryWrapper } from '@storybook/addons';
import { action } from '@storybook/addon-actions';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import Text from '../text';
import Icon from '../icon';
import Portal from '../portal';

import { Tooltip, TooltipProps } from './tooltip';

/**
 * Tooltips require
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<SafeAreaProvider>
			<AppProviderSizeProvider>
				<Portal.Provider>
					<Story {...context} />
					<Portal.Manager />
				</Portal.Provider>
			</AppProviderSizeProvider>
		</SafeAreaProvider>
	);
};

export default {
	title: 'Components/Tooltip',
	component: Tooltip,
	decorators: [AppProvider],
};

// const AppProvider: StoryWrapper = (Story, context) => {
// 	return (
// 		<SafeAreaProvider>
// 			<SnackbarProvider>
// 				<Story {...context} />
// 			</SnackbarProvider>
// 		</SafeAreaProvider>
// 	);
// };

// export default {
// 	title: 'Components/Snackbar',
// 	component: Snackbar,
// 	decorators: [AppProvider],
// };

export const basicUsage = (props: TooltipProps) => (
	<View style={{ padding: 50, alignItems: 'flex-start' }}>
		<Tooltip {...props}>
			<Text>This is some unclear text.</Text>
		</Tooltip>
	</View>
);

basicUsage.args = {
	content: 'Here is some very important clarification!',
};

basicUsage.argTypes = {
	children: { control: null },
};

export const withClickableChildren = () => (
	<View style={{ padding: 50, alignItems: 'flex-start' }}>
		<Tooltip content="Edit" preferredPlacement="below">
			<Icon name="edit" onPress={action('Icon clicked')} />
		</Tooltip>
	</View>
);
