import React from 'react';
import Svgs from './svg';

interface Props {
	name: Extract<keyof typeof Svgs, string>;
	disabled?: boolean;
}

const Icon: React.FC<Props> = ({ name, disabled }) => {
	let SvgIcon = Svgs[name];

	if (!SvgIcon) {
		SvgIcon = Svgs['error'];
	}

	return <SvgIcon width={20} height={20} fill="#000" />;
};

export default Icon;
