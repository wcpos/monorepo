import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
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
 * - Portals
 */
const AppProvider: React.FC = ({ children }) => {
	return (
		<Portal.Provider>
			{children}
			<Portal.Manager />
		</Portal.Provider>
	);
};

export const BasicUsage = (props: IconProps) => <Icon {...props} />;

export const PressableIcon = (props: IconProps) => <Icon {...props} />;
PressableIcon.args = {
	onPress: action('Pressed'),
};

export const IconWithTooltip = (props: IconProps) => (
	<AppProvider>
		<View style={{ padding: '30px', alignItems: 'flex-start' }}>
			<Icon {...props} />
		</View>
	</AppProvider>
);
IconWithTooltip.args = {
	tooltip: 'Icon label',
};

export const Skeleton = (props: IconSkeletonProps) => <Icon.Skeleton {...props} />;
