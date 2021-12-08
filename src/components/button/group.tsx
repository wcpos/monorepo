import * as React from 'react';
import { ViewStyle } from 'react-native';
import * as Styled from './styles';

export interface ButtonGroupProps {
	/**
	 * Children components (should be `Button` components).
	 */
	children: React.ReactNode;
	/**
	 * Alignment of the children.
	 *
	 * - `fill` will make all buttons have the same width.
	 * - `start` will align the buttons at the start.
	 * - `end` will align the buttons at the end.
	 */
	alignment?: 'start' | 'end' | 'full';
	/**
	 * Style for button group container
	 */
	style?: ViewStyle;
}

/**
 * Arrange `Button` components with consistent spacing.
 */
export const Group = ({ children, alignment = 'full', style }: ButtonGroupProps) => {
	const childrenLength = React.Children.count(children);
	const items = React.Children.map(children, (child, index) => (
		<Styled.GroupChild alignment={alignment} last={index === childrenLength - 1}>
			{child}
		</Styled.GroupChild>
	));

	return (
		<Styled.Group alignment={alignment} style={style}>
			{items}
		</Styled.Group>
	);
};
