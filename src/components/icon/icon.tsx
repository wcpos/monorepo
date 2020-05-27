import React from 'react';
import Svgs from './svg';
import { useTheme } from 'styled-components';

type Sizes = 'small' | 'normal' | 'large';

interface Props {
	color?: string;
	disabled?: boolean;
	height?: number;
	name: Extract<keyof typeof Svgs, string>;
	size?: Sizes;
	width?: number;
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

const Icon: React.FC<Props> = ({ color, disabled, name, size = 'normal', ...props }) => {
	/**
	 * @TODO why is context not working here??
	 */
	const theme = useTheme();
	console.log(theme);

	let SvgIcon = Svgs[name];

	if (!SvgIcon) {
		SvgIcon = Svgs['error'];
	}

	return (
		<SvgIcon
			width={props.width || getSize(size)}
			height={props.height || getSize(size)}
			fill={color}
		/>
	);
};

export default Icon;
