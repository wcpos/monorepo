import * as React from 'react';
import { StyleProp, ViewStyle, TextStyle } from 'react-native';

import { DrawerProps } from '@react-navigation/drawer/src/types';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { cn } from '@wcpos/components/src/lib/utils';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';

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
	drawerType?: DrawerProps['drawerType'];
};

/**
 *
 */
const DrawItem = ({ label, icon, focused, onPress, drawerType, style, ...rest }: Props) => {
	return drawerType === 'permanent' ? (
		<Tooltip style={style}>
			<TooltipTrigger asChild onPress={onPress}>
				<Button
					size="xl"
					className={cn(
						'rounded-none bg-transparent px-3 border-x-4 border-transparent h-10',
						focused && 'border-l-primary text-primary',
						!focused && 'hover:bg-white/10'
					)}
				>
					{icon({ focused })}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{label}</Text>
			</TooltipContent>
		</Tooltip>
	) : (
		<Button
			onPress={onPress}
			size="xl"
			className={cn(
				'rounded-none bg-transparent px-3 border-x-4 border-transparent items-start h-10',
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
};

export default DrawItem;
