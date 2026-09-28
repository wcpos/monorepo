import * as React from 'react';

import * as HoverCardPrimitive from '@rn-primitives/hover-card';

import { OVERLAY_MOTION, OVERLAY_PANEL, OverlayShell } from '../lib/overlay';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

function HoverCardContent({
	className,
	align = 'center',
	sideOffset = 4,
	ref,
	inline,
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content> & { inline?: boolean }) {
	const { open } = HoverCardPrimitive.useRootContext();
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayShell
			presentation="anchored"
			open={open}
			Scrim={HoverCardPrimitive.Overlay}
			testID={props.testID}
		>
			<TextClassContext.Provider value="text-foreground">
				<HoverCardPrimitive.Content
					ref={ref}
					align={align}
					sideOffset={sideOffset}
					className={cn(
						OVERLAY_PANEL.anchored,
						'web:outline-none web:cursor-auto z-50 w-64 max-w-full',
						open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
						className
					)}
					{...props}
				/>
			</TextClassContext.Provider>
		</OverlayShell>
	);
	return inline ? shell : <HoverCardPrimitive.Portal>{shell}</HoverCardPrimitive.Portal>;
}
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardContent, HoverCardTrigger };
