import * as React from 'react';
import { View } from 'react-native';

import * as PopoverPrimitive from '@rn-primitives/popover';

import { useIsPhone } from '../lib/device';
import { OVERLAY_MOTION, OVERLAY_PANEL, OverlayShell } from '../lib/overlay';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

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
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayShell
			presentation={presentation}
			open={open}
			Scrim={PopoverPrimitive.Overlay}
			onDismiss={phone ? () => onOpenChange(false) : undefined}
			testID={props.testID}
		>
			<TextClassContext.Provider value="text-foreground">
				{phone ? (
					<View
						testID={props.testID}
						className={cn(OVERLAY_PANEL.bottom, OVERLAY_MOTION.bottom.enter, 'z-50', className)}
					>
						{children}
					</View>
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
					>
						{children}
					</PopoverPrimitive.Content>
				)}
			</TextClassContext.Provider>
		</OverlayShell>
	);
	return inline ? (
		shell
	) : (
		<PopoverPrimitive.Portal hostName={portalHost}>{shell}</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverContent, PopoverTrigger, useRootContext };
