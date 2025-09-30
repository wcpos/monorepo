import * as React from 'react';
import { type StyleProp, type TextStyle, View, type ViewStyle } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import Platform from '@wcpos/utils/platform';

import type { DrawerNavigationOptions } from '@react-navigation/drawer';

type Props = {
	/**
	 * The label text of the item.
	 */
	label: string | ((props: { focused?: boolean; color?: string }) => React.ReactNode);
	/**
	 * Icon to display for the `DrawerItem`.
	 */
	icon?: (props: { focused?: boolean; size?: number; color?: string }) => React.ReactNode;
	/**
	 * URL to use for the link to the tab.
	 */
	to?: string;
	/**
	 * Whether to highlight the drawer item as active.
	 */
	focused?: boolean;
	/**
	 * Function to execute on press.
	 */
	onPress: () => void;
	/**
	 * Color for the icon and label when the item is active.
	 */
	activeTintColor?: string;
	/**
	 * Color for the icon and label when the item is inactive.
	 */
	inactiveTintColor?: string;
	/**
	 * Background color for item when its active.
	 */
	activeBackgroundColor?: string;
	/**
	 * Background color for item when its inactive.
	 */
	inactiveBackgroundColor?: string;
	/**
	 * Color of the touchable effect on press.
	 * Only supported on Android.
	 *
	 * @platform android
	 */
	pressColor?: string;
	/**
	 * Opacity of the touchable effect on press.
	 * Only supported on iOS.
	 *
	 * @platform ios
	 */
	pressOpacity?: number;
	/**
	 * Style object for the label element.
	 */
	labelStyle?: StyleProp<TextStyle>;
	/**
	 * Style object for the wrapper element.
	 */
	style?: StyleProp<ViewStyle>;
	drawerType?: DrawerNavigationOptions['drawerType'];
};

// Separate component for permanent drawer items
const PermanentDrawerItem = ({ icon, label, focused, onPress, style }) => {
	const button = (
		<Button
			onPress={onPress}
			size="xl"
			style={style}
			className={cn(
				'native:h-12 native:px-4 native:py-2 h-10 rounded-none border-x-4 border-transparent bg-transparent px-3',
				focused && 'border-l-primary text-primary',
				!focused && 'hover:bg-white/10'
			)}
		>
			{icon({ focused })}
		</Button>
	);

	// Only wrap with tooltip on web
	if (Platform.OS === 'web') {
		return (
			<Tooltip style={style}>
				<TooltipTrigger asChild onPress={onPress}>
					{button}
				</TooltipTrigger>
				<TooltipContent side="right">
					<Text>{label}</Text>
				</TooltipContent>
			</Tooltip>
		);
	}

	return button;
};

// Standard drawer item with label
const StandardDrawerItem = ({ icon, label, focused, onPress, style }) => (
	<Button
		onPress={onPress}
		size="xl"
		className={cn(
			'native:h-12 native:px-4 native:py-2 h-10 items-start rounded-none border-x-4 border-transparent bg-transparent px-3',
			focused && 'border-l-primary text-primary',
			!focused && 'hover:bg-white/10'
		)}
		style={style}
	>
		<HStack className="gap-3">
			{icon({ focused })}
			<ButtonText className={cn('pr-2', focused && 'text-primary')}>{label}</ButtonText>
		</HStack>
	</Button>
);

/**
 * DrawerItem component with declarative approach
 */
const DrawItem = ({ label, icon, focused, onPress, drawerType, style = {}, ...rest }: Props) => {
	// Use permanent drawer item for 'permanent' type, standard for all others
	if (drawerType === 'permanent') {
		return (
			<PermanentDrawerItem
				icon={icon}
				label={label}
				focused={focused}
				onPress={onPress}
				style={style}
			/>
		);
	}

	return (
		<StandardDrawerItem
			icon={icon}
			label={label}
			focused={focused}
			onPress={onPress}
			style={style}
		/>
	);
};

export default DrawItem;
