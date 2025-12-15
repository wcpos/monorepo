import * as React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import * as TooltipPrimitive from '@rn-primitives/tooltip';
import * as Slot from '@rn-primitives/slot';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { TooltipContentProps, TooltipProps, TooltipTriggerProps } from './types';

const TooltipContext = React.createContext<{ showOnNative: boolean }>({ showOnNative: false });

/**
 * On native, tooltips are disabled by default (just passes through children).
 * Set `showOnNative` to true to enable press-to-show tooltip behavior.
 */
function Tooltip({ children, showOnNative = false }: TooltipProps) {
	if (!showOnNative) {
		return <TooltipContext.Provider value={{ showOnNative }}>{children}</TooltipContext.Provider>;
	}

	return (
		<TooltipContext.Provider value={{ showOnNative }}>
			<TooltipPrimitive.Root>{children}</TooltipPrimitive.Root>
		</TooltipContext.Provider>
	);
}

/**
 * On native, when showOnNative is false, forwards props to children via Slot (for asChild)
 * or wraps in Pressable. This preserves onPress and other handlers.
 * When showOnNative is true, wraps with the primitive trigger.
 */
function TooltipTrigger({ children, asChild, ...props }: TooltipTriggerProps) {
	const { showOnNative } = React.useContext(TooltipContext);

	if (!showOnNative) {
		// Forward props to children - use Slot.Pressable for asChild, Pressable otherwise
		const Component = asChild ? Slot.Pressable : Pressable;
		return <Component {...props}>{children}</Component>;
	}

	return (
		<TooltipPrimitive.Trigger asChild={asChild} {...props}>
			{children}
		</TooltipPrimitive.Trigger>
	);
}

/**
 * On native, when showOnNative is false, renders nothing.
 * When showOnNative is true, renders the tooltip content.
 */
function TooltipContent({
	className,
	sideOffset = 4,
	portalHost,
	children,
	...props
}: TooltipContentProps) {
	const { showOnNative } = React.useContext(TooltipContext);

	if (!showOnNative) {
		return null;
	}

	return (
		<TooltipPrimitive.Portal hostName={portalHost}>
			<TooltipPrimitive.Overlay style={StyleSheet.absoluteFill}>
				<Animated.View entering={FadeIn} exiting={FadeOut}>
					<TextClassContext.Provider value="text-sm text-popover-foreground">
						<TooltipPrimitive.Content
							sideOffset={sideOffset}
							className={cn(
								'border-border bg-popover z-50 overflow-hidden rounded-md border px-3 py-1.5 shadow-md',
								className
							)}
							{...props}
						>
							{children}
						</TooltipPrimitive.Content>
					</TextClassContext.Provider>
				</Animated.View>
			</TooltipPrimitive.Overlay>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipTrigger };
export type { TooltipProps, TooltipContentProps, TooltipTriggerProps } from './types';
