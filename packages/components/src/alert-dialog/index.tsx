import * as React from 'react';
import type { GestureResponderEvent, ViewProps } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';

import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import * as Slot from '@rn-primitives/slot';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '../button';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlayWeb({ className, ...props }: AlertDialogPrimitive.OverlayProps) {
	const { open } = AlertDialogPrimitive.useRootContext();
	return (
		<AlertDialogPrimitive.Overlay
			className={cn(
				// Position
				'absolute bottom-0 left-0 right-0 top-0',
				// Layout and background
				'z-50 flex items-center justify-center bg-black/80',
				// Spacing
				'p-2',
				// Animation
				open ? 'web:animate-in web:fade-in-0' : 'web:animate-out web:fade-out-0',
				className
			)}
			{...props}
		/>
	);
}

function AlertDialogOverlayNative({
	className,
	children,
	...props
}: AlertDialogPrimitive.OverlayProps) {
	return (
		<AlertDialogPrimitive.Overlay
			style={StyleSheet.absoluteFill}
			className={cn(
				// Layout and background
				'z-50 flex items-center justify-center bg-black/80',
				// Spacing
				'p-2',
				className
			)}
			{...props}
			asChild
		>
			<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
				{children}
			</Animated.View>
		</AlertDialogPrimitive.Overlay>
	);
}

const AlertDialogOverlay = Platform.select({
	web: AlertDialogOverlayWeb,
	default: AlertDialogOverlayNative,
});

function AlertDialogContent({
	className,
	portalHost,
	...props
}: AlertDialogPrimitive.ContentProps & { portalHost?: string }) {
	const { open } = AlertDialogPrimitive.useRootContext();

	return (
		<AlertDialogPortal hostName={portalHost}>
			<AlertDialogOverlay>
				<AlertDialogPrimitive.Content
					className={cn(
						'border-border bg-background z-50 max-w-lg gap-4 rounded-lg border py-4',
						'web:duration-200 shadow-foreground/10 shadow-lg',
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
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-col gap-2 px-4', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
	return (
		<View
			className={cn('flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end', className)}
			{...props}
		/>
	);
}

function AlertDialogTitle({ className, asChild, ...props }: AlertDialogPrimitive.TitleProps) {
	const Component = asChild ? Slot.Text : Text;

	return (
		<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
			<AlertDialogPrimitive.Title asChild>
				<Component {...props} />
			</AlertDialogPrimitive.Title>
		</TextClassContext.Provider>
	);
}

function AlertDialogDescription({
	className,
	asChild,
	...props
}: AlertDialogPrimitive.DescriptionProps) {
	const Component = asChild ? Slot.Text : Text;

	return (
		<TextClassContext.Provider value="text-base text-foreground leading-5">
			<AlertDialogPrimitive.Description asChild>
				<Component {...props} />
			</AlertDialogPrimitive.Description>
		</TextClassContext.Provider>
	);
}

function AlertDialogAction({ asChild, disabled, ...props }: AlertDialogPrimitive.ActionProps) {
	return asChild ? (
		<Slot.Pressable
			aria-disabled={disabled ?? undefined}
			role="button"
			disabled={disabled ?? undefined}
			{...props}
		/>
	) : (
		<Button aria-disabled={disabled ?? undefined} disabled={disabled ?? undefined} {...props} />
	);
}

function AlertDialogCancel({ asChild, disabled, ...props }: AlertDialogPrimitive.CancelProps) {
	const { onOpenChange } = AlertDialogPrimitive.useRootContext();

	function onPress(ev: GestureResponderEvent) {
		if (props?.onPress) {
			props.onPress(ev);
		}
		onOpenChange(false);
	}

	return asChild ? (
		<Slot.Pressable
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
