import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';

import * as TooltipPrimitive from '@rn-primitives/tooltip';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { TooltipContentProps, TooltipProps } from './types';

function Tooltip({ children, delayDuration }: TooltipProps) {
	return <TooltipPrimitive.Root delayDuration={delayDuration}>{children}</TooltipPrimitive.Root>;
}

function TooltipContent({ className, sideOffset = 4, portalHost, ...props }: TooltipContentProps) {
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
								'web:animate-in web:fade-in-0 web:zoom-in-95 border-border bg-popover data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md border px-3 py-1.5 shadow-md',
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
export type { TooltipProps, TooltipContentProps, TooltipTriggerProps } from './types';
