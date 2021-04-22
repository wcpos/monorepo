import * as React from 'react';

import { isHoverEnabled } from './hover-state';

export interface HoverableProps {
	onHoverIn?: () => void;
	onHoverOut?: () => void;
	children: ((isHovered: boolean) => React.ReactNode) | React.ReactNode;
}

export const Hoverable = ({ onHoverIn, onHoverOut, children }: HoverableProps) => {
	const [isHovered, setHovered] = React.useState(false);
	const [showHover, setShowHover] = React.useState(true);

	const handleMouseEnter = React.useCallback(() => {
		if (isHoverEnabled() && !isHovered) {
			if (onHoverIn) onHoverIn();
			setHovered(true);
		}
	}, [isHovered, onHoverIn]);

	const handleMouseLeave = React.useCallback(() => {
		if (isHovered) {
			if (onHoverOut) onHoverOut();
			setHovered(false);
		}
	}, [isHovered, onHoverOut]);

	const handleGrant = React.useCallback(() => {
		setShowHover(false);
	}, []);

	const handleRelease = React.useCallback(() => {
		setShowHover(true);
	}, []);

	const child = typeof children === 'function' ? children(showHover && isHovered) : children;

	return React.cloneElement(React.Children.only(child), {
		onMouseEnter: handleMouseEnter,
		onMouseLeave: handleMouseLeave,
		// prevent hover showing while responder
		onResponderGrant: handleGrant,
		onResponderRelease: handleRelease,
		// if child is Touchable
		onPressIn: handleGrant,
		onPressOut: handleRelease,
	});
};
