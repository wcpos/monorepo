import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import Text from '../text';
import Button from '../button';
import Portal from '../portal';

import { Tooltip, TooltipProps } from './tooltip';

export default {
	title: 'Components/Tooltip',
	component: Tooltip,
};

/**
 * Tooltips require
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: React.FC = ({ children }) => {
	return (
		<SafeAreaProvider>
			<AppProviderSizeProvider>
				<Portal.Provider>
					{children}
					<Portal.Manager />
				</Portal.Provider>
			</AppProviderSizeProvider>
		</SafeAreaProvider>
	);
};

export const basicUsage = (props: TooltipProps) => (
	<AppProvider>
		<Tooltip {...props}>
			<Text>This is some unclear text.</Text>
		</Tooltip>
	</AppProvider>
);

basicUsage.args = {
	content: 'Here is some very important clarification!',
};

basicUsage.argTypes = {
	children: { control: null },
};

export const withClickableChildren = () => (
	<AppProvider>
		<Tooltip content="Edit" preferredPlacement="below">
			<Button onPress={action('Icon clicked')} />
		</Tooltip>
	</AppProvider>
);
