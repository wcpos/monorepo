import * as React from 'react';

import * as PopoverPrimitive from '@rn-primitives/popover';

import { POPOVER_ANCHOR } from './anchor';
import { AnchoredOverlay } from '../lib/overlay';
import { isToastTarget } from '../toast/target';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const useRootContext = PopoverPrimitive.useRootContext;

function PopoverContent({
	onInteractOutside,
	...props
}: Omit<PopoverPrimitive.ContentProps, 'side'> & {
	portalHost?: string;
	inline?: boolean;
	side?: 'top' | 'bottom' | 'left' | 'right';
}) {
	const { open, onOpenChange } = useRootContext();
	return (
		<AnchoredOverlay
			anchor={POPOVER_ANCHOR}
			open={open}
			onOpenChange={onOpenChange}
			size="web:cursor-auto web:outline-none w-80 max-w-full"
			outsidePress
			content={{
				...props,
				onInteractOutside: (event: Parameters<NonNullable<typeof onInteractOutside>>[0]) => {
					// A toast sits outside the popover, yet its action can belong to it: as a
					// dialog does (#2284), a press on the toast leaves the popover open (#2313).
					if (isToastTarget(event.target)) event.preventDefault();
					onInteractOutside?.(event);
				},
			}}
		/>
	);
}

export { Popover, PopoverContent, PopoverTrigger, useRootContext };
