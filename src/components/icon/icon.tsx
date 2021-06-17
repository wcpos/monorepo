import * as React from 'react';
import { useTheme } from 'styled-components/native';
import Svgs from './svg';
import Pressable from '../pressable';
import Tooltip from '../tooltip';
import Skeleton from '../skeleton';
import * as Styled from './styles';

const sizeMap = {
	default: 20,
	small: 16,
	'x-small': 12,
	large: 24,
	'x-large': 30,
};

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
	name: Extract<keyof typeof Svgs, string>;
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
}: IconProps) => {
	const theme = useTheme();

	let SvgIcon = Svgs[name];

	if (!SvgIcon) {
		SvgIcon = Svgs.error;
	}

	const maybeWrapIcon = (icon: React.ReactElement) => {
		let wrappedIcon = icon;
		wrappedIcon = onPress ? (
			<Styled.PressableIcon onPress={onPress} style={{ backgroundColor: '#ccc' }}>
				{wrappedIcon}
			</Styled.PressableIcon>
		) : (
			wrappedIcon
		);
		wrappedIcon = tooltip ? <Tooltip content={tooltip}>{wrappedIcon}</Tooltip> : wrappedIcon;
		return wrappedIcon;
	};

	return maybeWrapIcon(
		<SvgIcon
			// @TODO - clean up this component
			// @ts-ignore
			width={width || sizeMap[size]}
			// @ts-ignore
			height={height || sizeMap[size]}
			fill={color || theme?.TEXT_COLOR}
		/>
	);
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
