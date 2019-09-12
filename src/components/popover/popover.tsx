import React, { Fragment, useState } from 'react';
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
	content: React.ReactChild;
};

const Popover: React.FunctionComponent<Props> = ({ content, ...props }) => {
	let children;
	const [visible, setVisible] = useState(false);

	const toggleVisible = () => {
		setVisible(!visible);
	};

	const childCount = React.Children.count(props.children);
	if (childCount === 1) {
		children = React.cloneElement(React.Children.only(props.children), {
			onPress: toggleVisible,
		});
	}

	return (
		<Fragment>
			{children}
			{visible && <PopoverView>{content}</PopoverView>}
		</Fragment>
	);
};

export default Popover;
