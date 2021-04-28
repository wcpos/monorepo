import * as React from 'react';
import { useTheme } from 'styled-components/native';
import Svgs from './svg';
import Pressable from '../pressable';
import Tooltip from '../tooltip';

type Sizes = 'default' | 'small' | 'large';

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
	size?: Sizes;
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

const getSize = (size: Sizes) => {
	switch (size) {
		case 'small':
			return 16;
		case 'large':
			return 24;
		default:
			return 20;
	}
};

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
		wrappedIcon = onPress ? <Pressable onPress={onPress}>{wrappedIcon}</Pressable> : wrappedIcon;
		wrappedIcon = tooltip ? <Tooltip content={tooltip}>{wrappedIcon}</Tooltip> : wrappedIcon;
		return wrappedIcon;
	};

	return maybeWrapIcon(
		<SvgIcon
			// @TODO - clean up this component
			// @ts-ignore
			width={width || getSize(size)}
			// @ts-ignore
			height={height || getSize(size)}
			fill={color || theme?.TEXT_COLOR}
		/>
	);
};

// export default Icon;
