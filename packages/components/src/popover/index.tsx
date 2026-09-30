import * as React from 'react';

import * as PopoverPrimitive from '@rn-primitives/popover';

import { useIsPhone } from '../lib/device';
import { OVERLAY_MOTION, OVERLAY_PANEL, OverlaySheetPanel, OverlayShell } from '../lib/overlay';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';
import { isToastTarget } from '../toast/target';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const useRootContext = PopoverPrimitive.useRootContext;

function PopoverContent({
	className,
	align = 'center',
	side,
	sideOffset = 4,
	portalHost,
	inline,
	onInteractOutside,
	children,
	...props
}: Omit<PopoverPrimitive.ContentProps, 'side'> & {
	portalHost?: string;
	inline?: boolean;
	side?: 'top' | 'bottom' | 'left' | 'right';
}) {
	const phone = useIsPhone();
	const presentation = phone ? 'bottom' : 'anchored';
	const { open, onOpenChange } = useRootContext();
	const close = () => onOpenChange(false);
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayShell
			presentation={presentation}
			open={open}
			Scrim={PopoverPrimitive.Overlay}
			onDismiss={phone ? close : undefined}
			onOutsidePress={phone ? undefined : close}
			testID={props.testID}
		>
			<TextClassContext.Provider value="text-foreground">
				{phone ? (
					<OverlaySheetPanel testID={props.testID} className={className}>
						{children}
					</OverlaySheetPanel>
				) : (
					<PopoverPrimitive.Content
						align={align}
						side={side as PopoverPrimitive.ContentProps['side']}
						sideOffset={sideOffset}
						className={cn(
							OVERLAY_PANEL.anchored,
							'web:cursor-auto web:outline-none z-50 w-80 max-w-full',
							open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
							className
						)}
						{...props}
						onInteractOutside={(event) => {
							// A toast sits outside the popover, yet its action can belong to it: as a
							// dialog does (#2284), a press on the toast leaves the popover open (#2313).
							if (isToastTarget(event.target)) event.preventDefault();
							onInteractOutside?.(event);
						}}
					>
						{children}
					</PopoverPrimitive.Content>
				)}
			</TextClassContext.Provider>
		</OverlayShell>
	);
	// Inline (the gallery) has no portal, so nothing unmounts a closed sheet; the portal's
	// presence does that for every real caller.
	return inline ? (
		open ? (
			shell
		) : null
	) : (
		<PopoverPrimitive.Portal hostName={portalHost}>{shell}</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverContent, PopoverTrigger, useRootContext };
