import * as React from 'react';

import * as PopoverPrimitive from '@rn-primitives/popover';

import type { OverlayAnchor } from '../lib/overlay';

/** The popover family's anchored adapter: popover, multi-select, combobox and tree combobox. */
export const POPOVER_ANCHOR: OverlayAnchor = {
	Portal: PopoverPrimitive.Portal,
	Scrim: PopoverPrimitive.Overlay,
	Content: (props: PopoverPrimitive.ContentProps) => (
		<PopoverPrimitive.Content align="center" sideOffset={4} {...props} />
	),
};
