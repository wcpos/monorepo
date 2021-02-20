import React, { Fragment, useState } from 'react';
import { View } from 'react-native';
import useMeasure from '../../hooks/use-measure';
import { useEscKey } from '../../hooks/use-key';
import PopoverView from './view';

export type PlacementProps =
	| 'left'
	| 'top'
	| 'right'
	| 'bottom'
	| 'left-start'
	| 'left-end'
	| 'top-start'
	| 'top-end'
	| 'left-start'
	| 'left-end'
	| 'right-start'
	| 'right-end'
	| 'bottom-start'
	| 'bottom-end';

export type Props = {
	children: React.ReactElement;
	placement?: PlacementProps;
	content: React.ReactElement;
};

const Popover = ({ content, ...props }: Props) => {
	let children;
	const [visible, setVisible] = useState(false);
	const [measurements, onMeasure] = useState({
		height: 0,
		pageX: 0,
		pageY: 0,
		width: 0,
		x: 0,
		y: 0,
	});
	const ref = React.useRef<View>(null);
	const { onLayout } = useMeasure({ onMeasure, ref });

	const toggleVisible = () => {
		setVisible(!visible);
	};

	const closePopover = () => {
		setVisible(false);
	};

	useEscKey(closePopover);

	const childCount = React.Children.count(props.children);
	if (childCount === 1 && React.isValidElement(props.children)) {
		children = React.cloneElement(props.children, {
			// @ts-ignore
			onPress: toggleVisible,
		});
	}

	if (visible) {
		return (
			<>
				<View onLayout={onLayout} ref={ref}>
					{children}
				</View>
				<PopoverView measurements={measurements}>{content}</PopoverView>
			</>
		);
	}

	return children || null;
};

export default Popover;
