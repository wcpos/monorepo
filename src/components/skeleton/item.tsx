import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as Styled from './styles';

export interface ItemProps extends ViewStyle {
	children?: JSX.Element | JSX.Element[];

	style?: StyleProp<ViewStyle>;
	/**
	 * Image border shape
	 */
	border?: 'default' | 'rounded' | 'circular';
}

export const Item = ({ children, style, border = 'default' }: ItemProps) => (
	<Styled.Item
		border={border}
		// style={style}
	>
		{children}
	</Styled.Item>
);

Item.displayName = 'SkeletonItem';
