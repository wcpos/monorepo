import * as React from 'react';
import { useTheme } from 'styled-components/native';
import Svgs from './svg';

type Sizes = 'small' | 'normal' | 'large';
type ThemeProps = import('../../lib/theme/types').ThemeProps;

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
	// @ts-expect-error ts(2322)
	const theme: ThemeProps = useTheme();

	let SvgIcon = Svgs[name];

	if (!SvgIcon) {
		SvgIcon = Svgs.error;
	}

	return (
		<SvgIcon
			// @TODO - clean up this component
			// @ts-expect-error ts(2322)
			width={props.width || getSize(size)}
			height={props.height || getSize(size)}
			fill={color || theme?.TEXT_COLOR}
		/>
	);
};

export default Icon;
