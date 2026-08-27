import * as React from 'react';
import { Platform, StyleSheet } from 'react-native';

// import { Arrow } from '@radix-ui/react-popover';
import * as PopoverPrimitive from '@rn-primitives/popover';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

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
	children,
	...props
}: Omit<PopoverPrimitive.ContentProps, 'side'> & {
	portalHost?: string;
	side?: 'top' | 'bottom' | 'left' | 'right';
}) {
	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				{/* Full-bleed on native: unsized, this wrapper measures width×0 — its
				    absolutely-positioned child still DRAWS (RN doesn't clip), but
				    Android accessibility intersects every node's bounds with its
				    ancestors', so the entire popover subtree is pruned from the a11y
				    tree: invisible to TalkBack and to testID-driven E2E while looking
				    perfect on screen (monorepo#1614; proven via `dumpsys activity top`
				    showing the wrapper at 0,0-2560,0). box-none keeps outside-taps
				    falling through to the Overlay's dismiss. Same class fixed in
				    tooltip, hover-card, select, combobox, tree-combobox, select-multi. */}
				<Animated.View
					entering={FadeIn.duration(200)}
					exiting={FadeOut}
					pointerEvents="box-none"
					style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}
				>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align={align}
							side={side as PopoverPrimitive.ContentProps['side']}
							sideOffset={sideOffset}
							className={cn(
								'web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2 web:animate-in web:zoom-in-95 web:fade-in-0 web:cursor-auto web:outline-none border-border bg-popover z-50 w-72 rounded-md border p-2 shadow-md',
								className
							)}
							{...props}
						>
							{children}
							{/* <Arrow className={cn('fill-white')} /> */}
						</PopoverPrimitive.Content>
					</TextClassContext.Provider>
				</Animated.View>
			</PopoverPrimitive.Overlay>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverContent, PopoverTrigger, useRootContext };
