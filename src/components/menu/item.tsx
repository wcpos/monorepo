import * as React from 'react';
import * as Styled from './styles';

export interface ItemProps {
	/**
	 *
	 */
	children?: string;
	/**
	 *
	 */
	label?: string;
	/**
	 *
	 */
	onPress?: (value: any) => void;
	/**
	 *
	 */
	action?: () => void;
}

export const Item = ({ children, label = '', onPress, action }: ItemProps) => {
	const handlePress = () => {
		if (typeof action === 'function') {
			action();
		}
		if (typeof onPress === 'function') {
			onPress(label);
		}
	};

	return (
		<Styled.Item onPress={handlePress}>
			<Styled.Label>{children || label}</Styled.Label>
		</Styled.Item>
	);
};
