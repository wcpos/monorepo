import * as React from 'react';
import Platform from '@wcpos/common/src/lib/platform';
import Popover, { PopoverPlacement } from '../popover';
import Text from '../text';

export interface TooltipProps {
	/**
	 * The content which will trigger the Popover. The Popover will be anchored to this component.
	 */
	children: React.ReactNode;
	/**
	 * The content to display inside the Popover.
	 */
	content: React.ReactNode;
	/**
	 * Preferred placement of the Popover. The Popover will try to place itself according to this
	 * property. However, if there is not enough space left there to show up, it will show itself
	 * in opposite direction.
	 *
	 * For example, if we set `preferredPlacement="top"`, and there is not enough space for the Popover
	 * to show itself above the triggering view, it will show at the bottom of it.
	 */
	placement?: PopoverPlacement;
}

/**
 * Tooltip is a special type of Popover
 * @TODO - set timeout for native tooltips, need onOpen or similar
 */
export const Tooltip = ({ children, placement = 'top', ...props }: TooltipProps) => {
	// const ref = React.useRef<typeof Popover>(null);
	// useTimeout(() => {
	// 	if (Platform.isNative) {
	// 		ref.current?.close();
	// 	}
	// }, 2500);

	const content =
		typeof props.content === 'string' ? <Text type="inverse">{props.content}</Text> : props.content;

	return (
		<Popover
			// ref={ref}
			placement={placement}
			content={content}
			trigger="hover"
			clickThrough
			style={{ backgroundColor: 'black' }}
		>
			{children}
		</Popover>
	);
};
