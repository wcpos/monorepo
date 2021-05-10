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
	onPress: (value: any) => void;
}

export const Item = ({ children, label = '', onPress }: ItemProps) => {
	return (
		<Styled.Item onPress={onPress}>
			<Styled.Label>{children || label}</Styled.Label>
		</Styled.Item>
	);
};
