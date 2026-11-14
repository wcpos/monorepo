import * as React from 'react';

import * as PopoverPrimitive from '@rn-primitives/popover';

import { CONTENT_LETS_CHILDREN_SCROLL, type OverlayAnchor } from '../lib/overlay';

/** The popover family's anchored adapter: popover, multi-select, combobox and tree combobox. */
export const POPOVER_ANCHOR: OverlayAnchor = {
	Portal: PopoverPrimitive.Portal,
	Scrim: PopoverPrimitive.Overlay,
	Content: (props: PopoverPrimitive.ContentProps) => (
		<PopoverPrimitive.Content
			align="center"
			sideOffset={4}
			{...CONTENT_LETS_CHILDREN_SCROLL}
			{...props}
		/>
	),
};
