import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import * as Slot from '@rn-primitives/slot';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '../button';
import { cn } from '../lib/utils';
import { TextClassContext, Text } from '../text';

import type { ButtonProps } from '../button';
import type { PressableRef, TextRef, SlottableTextProps } from '@rn-primitives/types';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlayWeb = React.forwardRef<
	React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
	const { open } = AlertDialogPrimitive.useRootContext();
	return (
		<AlertDialogPrimitive.Overlay
			className={cn(
				'z-50 bg-black/80 flex justify-center items-center p-2 absolute top-0 right-0 bottom-0 left-0',
				open ? 'web:animate-in web:fade-in-0' : 'web:animate-out web:fade-out-0',
				className
			)}
			{...props}
			ref={ref}
		/>
	);
});

AlertDialogOverlayWeb.displayName = 'AlertDialogOverlayWeb';

const AlertDialogOverlayNative = React.forwardRef<
	React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, children, ...props }, ref) => {
	return (
		<AlertDialogPrimitive.Overlay
			style={StyleSheet.absoluteFill}
			className={cn('z-50 bg-black/80 flex justify-center items-center p-2', className)}
			{...props}
			ref={ref}
			asChild
		>
			<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
				{children}
			</Animated.View>
		</AlertDialogPrimitive.Overlay>
	);
});

AlertDialogOverlayNative.displayName = 'AlertDialogOverlayNative';

const AlertDialogOverlay = Platform.select({
	web: AlertDialogOverlayWeb,
	default: AlertDialogOverlayNative,
});

const AlertDialogContent = React.forwardRef<
	React.ElementRef<typeof AlertDialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & { portalHost?: string }
>(({ className, portalHost, ...props }, ref) => {
	const { open } = AlertDialogPrimitive.useRootContext();

	return (
		<AlertDialogPortal hostName={portalHost}>
			<AlertDialogOverlay>
				<AlertDialogPrimitive.Content
					ref={ref}
					className={cn(
						'z-50 max-w-lg gap-4 py-4 border border-border bg-background rounded-lg',
						'shadow-lg shadow-foreground/10 web:duration-200',
						open
							? 'web:animate-in web:fade-in-0 web:zoom-in-95'
							: 'web:animate-out web:fade-out-0 web:zoom-out-95',
						className
					)}
					{...props}
				/>
			</AlertDialogOverlay>
		</AlertDialogPortal>
	);
});
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof View>) => (
	<View className={cn('flex flex-col px-4 gap-2', className)} {...props} />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = ({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4', className)}
		{...props}
	/>
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<TextRef, SlottableTextProps>(
	({ className, asChild, ...props }, ref) => {
		const Component = asChild ? Slot.Text : Text;

		return (
			<TextClassContext.Provider value="text-lg native:text-xl text-foreground font-semibold leading-none">
				<AlertDialogPrimitive.Title asChild>
					<Component {...props} ref={ref} />
				</AlertDialogPrimitive.Title>
			</TextClassContext.Provider>
		);
	}
);
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription = React.forwardRef<
	React.ElementRef<typeof AlertDialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, asChild, ...props }, ref) => {
	const Component = asChild ? Slot.Text : Text;

	return (
		<TextClassContext.Provider value="text-base text-foreground leading-5">
			<AlertDialogPrimitive.Description asChild>
				<Component {...props} ref={ref} />
			</AlertDialogPrimitive.Description>
		</TextClassContext.Provider>
	);
});
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<PressableRef, ButtonProps>(
	({ asChild, disabled, ...props }, ref) => {
		return asChild ? (
			<Slot.Pressable
				ref={ref}
				aria-disabled={disabled ?? undefined}
				role="button"
				disabled={disabled ?? undefined}
				{...props}
			/>
		) : (
			<Button aria-disabled={disabled ?? undefined} disabled={disabled ?? undefined} {...props} />
		);
	}
);

AlertDialogAction.displayName = 'AlertDialogAction';

const AlertDialogCancel = React.forwardRef<PressableRef, ButtonProps>(
	({ asChild, disabled, ...props }, ref) => {
		const { onOpenChange } = AlertDialogPrimitive.useRootContext();

		function onPress(ev: GestureResponderEvent) {
			if (props?.onPress) {
				props.onPress(ev);
			}
			onOpenChange(false);
		}

		return asChild ? (
			<Slot.Pressable
				ref={ref}
				onPress={onPress}
				aria-disabled={disabled ?? undefined}
				role="button"
				disabled={disabled ?? undefined}
				{...props}
			/>
		) : (
			<Button
				aria-disabled={disabled ?? undefined}
				disabled={disabled ?? undefined}
				onPress={onPress}
				variant="outline"
				{...props}
			/>
		);
	}
);
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
