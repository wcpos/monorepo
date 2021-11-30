import * as React from 'react';
import { View, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import Pressable from '@wcpos/common/src/components/pressable';
import Tooltip from '@wcpos/common/src/components/tooltip';

type Props = {
	/**
	 * The label text of the item.
	 */
	label: string | ((props: { focused: boolean; color: string }) => React.ReactNode);
	/**
	 * Icon to display for the `DrawerItem`.
	 */
	icon?: (props: { focused: boolean; size: number; color: string }) => React.ReactNode;
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
};

/**
 *
 */
const DrawItem = ({ label, icon, ...rest }: Props) => {
	return (
		<Pressable style={{ flexDirection: 'row', alignItems: 'center' }}>
			{icon && (
				<Tooltip content={label} preferredPlacement="below">
					{icon()}
				</Tooltip>
			)}
			<Text>{label}</Text>
		</Pressable>
	);
};

export default DrawItem;
