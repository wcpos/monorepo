import React from 'react';
import Icon from '../icon';
import { Box, Check } from './styles';

type Props = {
	checked?: boolean;
	hasError?: boolean;
	disabled?: boolean;
	focused?: boolean;
	hovered?: boolean;
	pressed?: boolean;
};

export default function CheckboxIcon({
	checked,
	hasError,
	disabled,
	focused,
	hovered,
	pressed,
}: Props) {
	const errorState = hasError && !disabled && !checked;
	const iconColor = disabled ? '#ccc' : '#FFFFFF';
	return (
		<Box
			checked={checked}
			// style={[
			//   styles.box,
			//   errorState && styles.boxError,
			//   focused && styles.boxFocused,
			//   hovered && !disabled && styles.boxHover,
			//   pressed && styles.boxPressed,
			// ]}
		>
			{checked && <Check name="check" size="small" disabled={disabled} color="#FFF" />}
		</Box>
	);
}
