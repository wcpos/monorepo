import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import * as TooltipPrimitive from '@rn-primitives/tooltip';
import Animated from 'react-native-reanimated';

import { OVERLAY_MOTION } from '../lib/overlay';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { TooltipContentProps, TooltipProps, TooltipTriggerProps } from './types';

function Tooltip({ children, delayDuration, className }: TooltipProps) {
	return (
		<TooltipPrimitive.Root delayDuration={delayDuration} className={className}>
			{children}
		</TooltipPrimitive.Root>
	);
}

function TooltipContent({ className, sideOffset = 4, portalHost, ...props }: TooltipContentProps) {
	return (
		<TooltipPrimitive.Portal hostName={portalHost}>
			<TooltipPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View
					entering={Platform.select({ web: undefined, default: OVERLAY_MOTION.anchored.entering })}
					exiting={Platform.select({ web: undefined, default: OVERLAY_MOTION.anchored.exiting })}
				>
					<TextClassContext.Provider value="text-sm text-popover-foreground">
						<TooltipPrimitive.Content
							sideOffset={sideOffset}
							className={cn(
								// The anchored panel's look and entrance (lib/overlay): hairline border, no shadow.
								OVERLAY_MOTION.anchored.enter,
								'border-border bg-popover z-50 overflow-hidden rounded-lg border px-3 py-1.5',
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

const PassiveTriggerContext = React.createContext(false);

/**
 * Wraps the content of a pressable parent (a table row that adds on press). A tooltip
 * trigger inside is then a hint, not a control: it renders no <button>, so it may sit in a
 * parent that is one, and a press on it reaches the parent. Hover still opens the tooltip.
 * The web counterpart of the native rule for handlerless triggers.
 */
function TooltipPassiveTriggers({ children }: { children: React.ReactNode }) {
	return <PassiveTriggerContext.Provider value>{children}</PassiveTriggerContext.Provider>;
}

function TooltipTrigger({ asChild, children, ...props }: TooltipTriggerProps) {
	const passive = React.useContext(PassiveTriggerContext);
	if (passive && !asChild) {
		return (
			<TooltipPrimitive.Trigger asChild {...props}>
				{/* The child's role wins the slot merge, so the primitive's `button` never lands. */}
				<View role="none">{children}</View>
			</TooltipPrimitive.Trigger>
		);
	}
	return (
		<TooltipPrimitive.Trigger asChild={asChild} {...props}>
			{children}
		</TooltipPrimitive.Trigger>
	);
}

export { Tooltip, TooltipContent, TooltipPassiveTriggers, TooltipTrigger };
export type { TooltipProps, TooltipContentProps, TooltipTriggerProps } from './types';
