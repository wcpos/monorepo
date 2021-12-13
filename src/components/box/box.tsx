import React, { useMemo } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Space from '../space';
import * as Styled from './styles';

type Spacing = import('@wcpos/common/src/themes').Spacing;
type Rounding = import('@wcpos/common/src/themes').Rounding;

export interface BoxProps {
	/**
	 * Children Views.
	 */
	children: React.ReactNode;
	/**
	 * Padding applied on all sides.
	 */
	padding?: Spacing;
	/**
	 * Padding applied horizontally (left & right).
	 */
	paddingX?: Spacing;
	/**
	 * Padding applied vertically (top & bottom).
	 */
	paddingY?: Spacing;
	/**
	 * Padding applied to top side.
	 */
	paddingTop?: Spacing;
	/**
	 * Padding applied to bottom side.
	 */
	paddingBottom?: Spacing;
	/**
	 * Padding applied to left side.
	 */
	paddingLeft?: Spacing;
	/**
	 * Padding applied to right side.
	 */
	paddingRight?: Spacing;
	/**
	 * Padding applied to right side.
	 */
	rounding?: Rounding;
	/**
	 * Padding applied to top side.
	 */
	roundingTopLeft?: Rounding;
	/**
	 * Padding applied to bottom side.
	 */
	roundingTopRight?: Rounding;
	/**
	 * Padding applied to left side.
	 */
	roundingBottomRight?: Rounding;
	/**
	 * Padding applied to right side.
	 */
	roundingBottomLeft?: Rounding;
	/**
	 * Set to `true` to place 1px solid border on all sides.
	 */
	border?: boolean;
	/**
	 * Set to `true` to set underlying view `flex` property to `1` to fill parent view.
	 */
	fill?: boolean;
	/**
	 * Defines a space to use between each component.
	 */
	space?: Spacing;
	/**
	 * Set to `true` to display children components horizontally.
	 */
	horizontal?: boolean;
	/**
	 * Defines how children views are aligned (in opposite direction of the Box).
	 */
	align?: 'fill' | 'start' | 'end' | 'center';
	/**
	 * Defines how views are aligned (in same direction of the Box).
	 */
	distribution?: 'start' | 'end' | 'center' | 'spaceBetween';
	/**
	 * If true, children order will be reversed.
	 */
	reverse?: boolean;
	/**
	 * If true, a box shadow will be applied
	 */
	raised?: boolean;
	style?: StyleProp<ViewStyle>;
}

/**
 * Used as a basic building block to layout views. Layouting follow a flexbox like approach.
 *
 * > **Note:** Padding is applied from the more generic ones to the more specific.
 * >
 * >For example, if you apply `padding="small"` and `paddingTop="large"`, the `Box` will have a `small` padding on all sides, except top where the padding will be `large`.
 */
export const Box = ({
	children,
	padding = 'none',
	fill = false,
	space = 'none',
	horizontal = false,
	align = 'fill',
	distribution = 'start',
	reverse = false,
	border = false,
	...rest
}: BoxProps) => {
	// Filter only children that are JSX elements
	const items = useMemo(() => {
		const filtered = React.Children.toArray(children).filter((x) => x);

		return React.Children.map(filtered, (child, index) => (
			<>
				{index > 0 && space !== 'none' && <Space value={space} />}
				{child}
			</>
		));
	}, [children, space]);

	return (
		<Styled.Box
			padding={padding}
			fill={fill}
			space={space}
			horizontal={horizontal}
			align={align}
			distribution={distribution}
			reverse={reverse}
			border={border}
			{...rest}
		>
			{items}
		</Styled.Box>
	);
};
