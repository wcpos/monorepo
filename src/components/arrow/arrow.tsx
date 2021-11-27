import * as React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import captalize from 'lodash/capitalize';
import get from 'lodash/get';
import * as Styled from './styles';

export interface ArrowProps {
	direction?: 'left' | 'right' | 'up' | 'down';
	size?: 'small' | 'large' | 'default';
	color?: ViewStyle['backgroundColor'];
	style?: StyleProp<ViewStyle>;
}

export const Arrow = ({ direction = 'down', size = 'default', color, style }: ArrowProps) => {
	const StyledArrow = get(Styled, captalize(direction));

	return (
		<Styled.Container direction={direction} size={size} style={style}>
			<StyledArrow size={size} color={color} />
		</Styled.Container>
	);
};
