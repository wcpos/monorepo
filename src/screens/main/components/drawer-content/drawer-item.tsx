import * as React from 'react';
import { StyleProp, ViewStyle, TextStyle } from 'react-native';

import { DrawerProps } from '@react-navigation/drawer/src/types';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

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
				<Button variant="ghost" className="rounded-none">
					{icon({ focused })}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{label}</Text>
			</TooltipContent>
		</Tooltip>
	) : (
		<Button variant="ghost" onPress={onPress} className="rounded-none" style={style}>
			<HStack>
				{icon({ focused })}
				<ButtonText className="text-xl">{label}</ButtonText>
			</HStack>
		</Button>
	);

	// const iconNode = icon ? icon({ focused }) : null;

	// const labelNode =
	// 	typeof label === 'string' ? (
	// 		<Text
	// 			type={focused ? 'primary' : 'inverse'}
	// 			size="large"
	// 			style={{ marginLeft: 10, minWidth: 130 }}
	// 		>
	// 			{label}
	// 		</Text>
	// 	) : (
	// 		label({ focused })
	// 	);

	// const buttonNode = (
	// 	<Pressable
	// 		onPress={onPress}
	// 		style={({ hovered }) => {
	// 			return {
	// 				flexDirection: 'row',
	// 				alignItems: 'center',
	// 				paddingHorizontal: drawerType === 'permanent' ? 10 : 20,
	// 				paddingVertical: 10,
	// 				backgroundColor: hovered && !focused ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
	// 				borderLeftWidth: 5,
	// 				borderRightWidth: 5,
	// 				borderColor: 'transparent',
	// 				borderLeftColor: focused ? theme.colors.primary : 'transparent',
	// 			};
	// 		}}
	// 	>
	// 		{iconNode}
	// 		{drawerType !== 'permanent' && labelNode}
	// 	</Pressable>
	// );

	// return (
	// 	<View style={style}>
	// 		{drawerType === 'permanent' ? (
	// 			<Tooltip content={label} placement="right">
	// 				{buttonNode}
	// 			</Tooltip>
	// 		) : (
	// 			buttonNode
	// 		)}
	// 	</View>
	// );
};

export default DrawItem;
