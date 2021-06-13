import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { action } from '@storybook/addon-actions';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import { Icon, IconProps, IconSkeletonProps } from './icon';
import svgs from './svg';
import Portal from '../portal';

const iconNames = Object.keys(svgs);

export default {
	title: 'Components/Icon',
	component: Icon,
	argTypes: {
		color: { control: 'color' },
		size: {
			control: {
				type: 'inline-radio',
				// options: [
				// 	'default', 'small', 'large'
				// ],
			},
		},
	},
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

export const BasicUsage = (props: IconProps) => <Icon {...props} />;

export const PressableIcon = (props: IconProps) => <Icon {...props} />;
PressableIcon.args = {
	onPress: action('Pressed'),
};

export const IconWithTooltip = (props: IconProps) => (
	<AppProvider>
		<Icon {...props} />
	</AppProvider>
);
IconWithTooltip.args = {
	tooltip: 'Icon label',
};

export const Skeleton = (props: IconSkeletonProps) => <Icon.Skeleton {...props} />;
