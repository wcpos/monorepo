import * as React from 'react';
import { ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import get from 'lodash/get';
import { useTheme } from 'styled-components/native';
import * as Svgs from './svg/fontawesome/solid';
import Tooltip from '../tooltip2';
import Skeleton from '../skeleton';
import Pressable from '../pressable';
import Ripple from '../ripple';
import * as Styled from './styles';

export type IconName = Extract<keyof typeof Svgs, string>;

/**
 *
 */
const sizeMap = {
	default: 20,
	small: 16,
	'x-small': 12,
	large: 24,
	'x-large': 30,
};

/**
 *
 */
export interface IconProps {
	/**
	 * Icon colour
	 */
	color?: string;
	/**
	 * Set to `true` to disable.
	 */
	disabled?: boolean;
	/**
	 * Set icon height.
	 */
	height?: number;
	/**
	 * Icon key.
	 */
	name: IconName;
	/**
	 * Set icon size.
	 */
	size?: Extract<keyof typeof sizeMap, string>;
	/**
	 * Set icon width.
	 */
	width?: number;
	/**
	 * Turns icon into a button. Called when icon is pressed.
	 */
	onPress?: null | ((event: import('react-native').GestureResponderEvent) => void);
	/**
	 * Wraps the icon in a Tooltip component
	 */
	tooltip?: string;
	/**
	 * Styling for Pressable icons
	 */
	backgroundStyle?: 'ripple' | 'none' | ViewStyle;
	/**
	 * Icon colour
	 */
	type?: import('@wcpos/common/src/themes').ColorTypes;
}

/**
 * Icon component
 */
export const Icon = ({
	color,
	disabled,
	name,
	size = 'default',
	width,
	height,
	onPress,
	tooltip,
	backgroundStyle = 'ripple',
	type = 'primary',
}: IconProps) => {
	const theme = useTheme();
	const iconColor = color || get(theme, `COLOR_${type.toUpperCase()}`);
	const SvgIcon = get(Svgs, name, Svgs.circleExclamation);
	const showRipple = useSharedValue(false);

	const IconComponent = (
		<SvgIcon width={width || sizeMap[size]} height={height || sizeMap[size]} fill={iconColor} />
	);

	if (onPress) {
		return (
			<Pressable
				onPress={onPress}
				onHoverIn={() => {
					showRipple.value = true;
				}}
				onHoverOut={() => {
					showRipple.value = false;
				}}
				style={[backgroundStyle !== 'none' && backgroundStyle !== 'ripple' && backgroundStyle]}
			>
				{backgroundStyle === 'ripple' && <Ripple showRipple={showRipple} />}
				{IconComponent}
			</Pressable>
		);
	}

	if (tooltip) {
		return <Tooltip content={tooltip}>{IconComponent}</Tooltip>;
	}

	return IconComponent;
};

/**
 *
 */
export interface IconSkeletonProps {
	/**
	 *
	 */
	size?: Extract<keyof typeof sizeMap, string>;
}

/**
 *
 */
export const IconSkeleton = ({ size = 'default' }: IconSkeletonProps) => {
	return <Skeleton border="circular" width={sizeMap[size]} height={sizeMap[size]} />;
};

Icon.Skeleton = IconSkeleton;
