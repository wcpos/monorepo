import * as React from 'react';
import { useTheme } from 'styled-components/native';
import Svgs from './svg';
import Pressable from '../pressable';

type Sizes = 'default' | 'small' | 'large';

export interface IIconProps {
	color?: string;
	disabled?: boolean;
	height?: number;
	name: Extract<keyof typeof Svgs, string>;
	size?: Sizes;
	width?: number;
	onPress?: null | ((event: import('react-native').GestureResponderEvent) => void);
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
}: IIconProps) => {
	const theme = useTheme();

	let SvgIcon = Svgs[name];

	if (!SvgIcon) {
		SvgIcon = Svgs.error;
	}

	if (onPress) {
		return (
			<Pressable onPress={onPress}>
				<SvgIcon
					// @TODO - clean up this component
					// @ts-ignore
					width={width || getSize(size)}
					// @ts-ignore
					height={height || getSize(size)}
					fill={color || theme?.TEXT_COLOR}
				/>
			</Pressable>
		);
	}

	return (
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
