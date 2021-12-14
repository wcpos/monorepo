import * as React from 'react';
import { ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import get from 'lodash/get';
import { useTheme } from 'styled-components/native';
import * as Svgs from './svg/fontawesome/solid';
import Tooltip from '../tooltip';
import Skeleton from '../skeleton';
import Pressable from '../pressable';
import Ripple from '../ripple';
import * as Styled from './styles';

export type IconName = Extract<keyof typeof Svgs, string>;
type IconSizes = import('@wcpos/common/src/themes').IconSizes;

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
	size?: IconSizes;
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
	 *
	 */
	tooltipPlacement?: import('../tooltip').TooltipProps['placement'];
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
	size = 'medium',
	width,
	height,
	onPress,
	tooltip,
	tooltipPlacement = 'top',
	backgroundStyle = 'ripple',
	type = 'primary',
}: IconProps) => {
	const theme = useTheme();
	const iconColor = color || get(theme, `COLOR_${type.toUpperCase()}`);
	const SvgIcon = get(Svgs, name, Svgs.circleExclamation);
	const showRipple = useSharedValue(false);

	const IconComponent = (
		<SvgIcon
			width={width || theme.iconSizes[size]}
			height={height || theme.iconSizes[size]}
			fill={iconColor}
		/>
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
		return (
			<Tooltip content={tooltip} placement={tooltipPlacement}>
				{IconComponent}
			</Tooltip>
		);
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
	size?: IconSizes;
}

/**
 *
 */
export const IconSkeleton = ({ size = 'medium' }: IconSkeletonProps) => {
	const theme = useTheme();
	return (
		<Skeleton border="circular" width={theme.iconSizes[size]} height={theme.iconSizes[size]} />
	);
};

Icon.Skeleton = IconSkeleton;
