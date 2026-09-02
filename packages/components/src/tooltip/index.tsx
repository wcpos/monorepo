import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import * as TooltipPrimitive from '@rn-primitives/tooltip';
import { Slot } from '@rn-primitives/slot';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { TooltipContentProps, TooltipProps, TooltipTriggerProps } from './types';

const TooltipContext = React.createContext<{ showOnNative: boolean }>({ showOnNative: false });

/**
 * On native, tooltips are disabled by default (just passes through children).
 * Set `showOnNative` to true to enable press-to-show tooltip behavior.
 */
function Tooltip({ children, showOnNative = false, className }: TooltipProps) {
	if (!showOnNative) {
		// Children pass through with no wrapper view — className has nothing to
		// land on and layout flows to the trigger directly.
		return <TooltipContext.Provider value={{ showOnNative }}>{children}</TooltipContext.Provider>;
	}

	return (
		<TooltipContext.Provider value={{ showOnNative }}>
			<TooltipPrimitive.Root className={className}>{children}</TooltipPrimitive.Root>
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
		// Forward props to children - Slot for asChild; a Pressable only when the caller
		// actually passed press handlers. A Pressable with no handlers still claims the
		// touch responder, so a tooltip-wrapped icon inside a pressable parent (the cart's
		// "+" new-order tab) swallowed the tap at its centre and only the edge worked.
		const hasPressHandlers = Object.keys(props).some((key) => /^on(Long)?Press/.test(key));
		const Component = asChild ? Slot : hasPressHandlers ? Pressable : View;
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
				{/* Full-bleed + box-none: an unsized wrapper is width×0, and Android
				    a11y prunes out-of-bounds children — see popover/index.tsx. */}
				<Animated.View
					entering={FadeIn}
					exiting={FadeOut}
					pointerEvents="box-none"
					style={StyleSheet.absoluteFill}
				>
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
