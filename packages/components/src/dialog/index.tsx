import * as React from 'react';
import { Platform, ScrollView, ScrollViewProps, StyleSheet, View, ViewProps } from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';

import { Button } from '../button';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';

import type { SlottablePressableProps } from '@rn-primitives/types';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogTitle = DialogPrimitive.Title;

/**
 * @TODO - it would be good to expand the Dialog context to include button presses from the Action component.
 */
const useRootContext = DialogPrimitive.useRootContext;

function DialogOverlayWeb({ className, ...props }: DialogPrimitive.OverlayProps) {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPrimitive.Overlay
			className={cn(
				'absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center bg-black/70 p-2',
				open ? 'web:animate-in web:fade-in-0' : 'web:animate-out web:fade-out-0',
				'[&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				className
			)}
			{...props}
		/>
	);
}

function DialogOverlayNative({ className, children, ...props }: DialogPrimitive.OverlayProps) {
	const insets = useSafeAreaInsets();

	return (
		<DialogPrimitive.Overlay
			style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
			className={cn(
				'flex items-center justify-center bg-black/70 p-2',
				'[&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				className
			)}
			{...props}
		>
			<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.bottom}>
				<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
					<>{children}</>
				</Animated.View>
			</KeyboardAvoidingView>
		</DialogPrimitive.Overlay>
	);
}

function DialogClose({ asChild, ...props }: DialogPrimitive.CloseProps) {
	return (
		<DialogPrimitive.Close asChild>
			{asChild ? <Slot.Pressable {...props} /> : <Button variant="outline" {...props} />}
		</DialogPrimitive.Close>
	);
}

const DialogOverlay = Platform.select({
	web: DialogOverlayWeb,
	default: DialogOverlayNative,
});

const dialogContentVariants = cva(
	'border-border web:cursor-default bg-background z-60 max-h-full max-w-full gap-4 rounded-lg border py-4',
	{
		variants: {
			size: {
				default: 'w-96',
				xs: 'w-64',
				sm: 'w-80',
				md: 'w-96',
				lg: 'w-lg',
				xl: 'w-160',
				full: 'w-full',
			},
		},
		defaultVariants: {
			size: 'default',
		},
	}
);

function DialogContent({
	className,
	size,
	children,
	portalHost,
	...props
}: DialogPrimitive.ContentProps & VariantProps<typeof dialogContentVariants>) {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPortal hostName={portalHost}>
			<DialogOverlay>
				<DialogPrimitive.Content
					className={cn(
						dialogContentVariants({ size }),
						open
							? 'web:animate-in web:fade-in-0 web:zoom-in-95'
							: 'web:animate-out web:fade-out-0 web:zoom-out-95',
						className
					)}
					{...props}
				>
					{children}
					<View className="absolute top-2 right-2">
						<DialogClose
							className="web:transition-opacity web:hover:opacity-100 opacity-70"
							asChild
						>
							<IconButton name="xmark" />
						</DialogClose>
					</View>
				</DialogPrimitive.Content>
			</DialogOverlay>
		</DialogPortal>
	);
}

/**
 * NOTE: extra space on right for the close button
 */
function DialogHeader({ className, ...props }: ViewProps) {
	return (
		<View
			className={cn('flex flex-col gap-1.5 pr-8 pl-4 text-center sm:text-left', className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: ViewProps) {
	return (
		<View
			className={cn(
				'flex max-w-full flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end',
				className
			)}
			{...props}
		/>
	);
}

function DialogDescription({ className, ...props }: DialogPrimitive.DescriptionProps) {
	return (
		<DialogPrimitive.Description
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	);
}

function DialogBody({ className, ...props }: ScrollViewProps) {
	return (
		<ScrollView
			horizontal={false}
			className={cn('flex flex-col gap-2 px-4 py-1', className)}
			{...props}
		/>
	);
}

/**
 * TODO: it would be nice to pass the onPress handler to the useRootContext hook so that we can
 * detect button presses from anywhere in the dialog.
 */
function DialogAction({ asChild, disabled, ...props }: SlottablePressableProps) {
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

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
	DialogBody,
	useRootContext,
	DialogAction,
};
