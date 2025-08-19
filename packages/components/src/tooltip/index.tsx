import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';

import * as TooltipPrimitive from '@rn-primitives/tooltip';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const Tooltip = TooltipPrimitive.Root;

function TooltipContent({
	className,
	sideOffset = 4,
	portalHost,
	...props
}: TooltipPrimitive.ContentProps & { portalHost?: string }) {
	return (
		<TooltipPrimitive.Portal hostName={portalHost}>
			<TooltipPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View
					entering={Platform.select({ web: undefined, default: FadeIn })}
					exiting={Platform.select({ web: undefined, default: FadeOut })}
				>
					<TextClassContext.Provider value="text-sm text-popover-foreground">
						<TooltipPrimitive.Content
							sideOffset={sideOffset}
							className={cn(
								'web:animate-in web:fade-in-0 web:zoom-in-95 border-border bg-popover shadow-foreground/5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md border px-3 py-1.5 shadow-md',
								className
							)}
							{...props}
						/>
					</TextClassContext.Provider>
				</Animated.View>
			</TooltipPrimitive.Overlay>
		</TooltipPrimitive.Portal>
	);
}

const TooltipTrigger = TooltipPrimitive.Trigger;

export { Tooltip, TooltipContent, TooltipTrigger };
