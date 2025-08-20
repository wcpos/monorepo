import React, { Children, type FunctionComponent, type PropsWithChildren, useMemo } from 'react';
import { type FlexStyle, View, type ViewProps } from 'react-native';

import { useDraggableStack, type UseDraggableStackOptions } from '../hooks/useDraggableStack';

import type { UniqueIdentifier } from '../../../types';

export type DraggableStackProps = Pick<ViewProps, 'style'> &
	Pick<UseDraggableStackOptions, 'onOrderChange' | 'onOrderUpdate' | 'shouldSwapWorklet'> & {
		direction?: FlexStyle['flexDirection'];
		gap?: number;
	};

export const DraggableStack: FunctionComponent<PropsWithChildren<DraggableStackProps>> = ({
	children,
	direction = 'row',
	gap = 0,
	onOrderChange,
	onOrderUpdate,
	shouldSwapWorklet,
	style: styleProp,
}) => {
	const initialOrder = useMemo(
		() =>
			Children.map(children, (child) => {
				// console.log("in");
				if (React.isValidElement(child)) {
					return child.props.id;
				}
				return null;
			})?.filter(Boolean) as UniqueIdentifier[],
		[children]
	);

	const style = useMemo(
		() =>
			Object.assign(
				{
					flexDirection: direction,
					gap,
				},
				styleProp
			),
		[gap, direction, styleProp]
	);

	const horizontal = ['row', 'row-reverse'].includes(style.flexDirection);

	useDraggableStack({
		gap: style.gap,
		horizontal,
		initialOrder,
		onOrderChange,
		onOrderUpdate,
		shouldSwapWorklet,
	});

	return <View style={style}>{children}</View>;
};
