import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { action } from '@storybook/addon-actions';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import { Icon } from './icon';
import svgs from './svg';
import Portal from '../portal';

type IconProps = import('./icon').IconProps;

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

export const basicUsage = (props: IconProps) => <Icon {...props} />;

export const pressableIcon = (props: IconProps) => <Icon {...props} />;
pressableIcon.args = {
	onPress: action('Pressed'),
};

export const iconWithTooltip = (props: IconProps) => (
	<AppProvider>
		<Icon {...props} />
	</AppProvider>
);
iconWithTooltip.args = {
	tooltip: 'Icon label',
};
