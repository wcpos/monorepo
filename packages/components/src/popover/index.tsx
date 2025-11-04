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
	sideOffset = 4,
	portalHost,
	children,
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string }) {
	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut}>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align={align}
							sideOffset={sideOffset}
							className={cn(
								'web:cursor-auto web:outline-none web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2 web:animate-in web:zoom-in-95 web:fade-in-0',
								'border-border bg-popover z-50 w-72 rounded-md border p-2 shadow-md',
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
