import * as React from 'react';
import * as Styled from './styles';

export interface ArrowProps {
	direction?: 'left' | 'right' | 'up' | 'down';
	size?: 'small' | 'large' | 'default';
}

export const Arrow = ({ direction = 'down', size = 'default' }: ArrowProps) => {
	const renderArrow = () => {
		switch (direction) {
			case 'left':
				return <Styled.Left />;
			case 'right':
				return <Styled.Right />;
			case 'up':
				return <Styled.Up />;
			default:
				return <Styled.Down />;
		}
	};

	return <Styled.Container>{renderArrow()}</Styled.Container>;
};
