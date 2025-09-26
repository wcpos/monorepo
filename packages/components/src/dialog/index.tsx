import * as React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';

import { Button } from '../button';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { ButtonProps } from '../button';
import type { PressableRef, SlottableTextProps, TextRef } from '@rn-primitives/types';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

/**
 * @TODO - it would be good to expand the Dialog context to include button presses from the Action component.
 */
const useRootContext = DialogPrimitive.useRootContext;

const DialogOverlayWeb = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPrimitive.Overlay
			className={cn(
				'absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-black/70 p-2',
				open ? 'web:animate-in web:fade-in-0' : 'web:animate-out web:fade-out-0',
				'[&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				className
			)}
			{...props}
			ref={ref}
		/>
	);
});

DialogOverlayWeb.displayName = 'DialogOverlayWeb';

const DialogOverlayNative = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, children, ...props }, ref) => {
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
			ref={ref}
		>
			<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.bottom}>
				<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
					<>{children}</>
				</Animated.View>
			</KeyboardAvoidingView>
		</DialogPrimitive.Overlay>
	);
});

DialogOverlayNative.displayName = 'DialogOverlayNative';

const DialogClose = React.forwardRef<PressableRef, ButtonProps>(({ asChild, ...props }, ref) => (
	<DialogPrimitive.Close ref={ref} asChild>
		{asChild ? <Slot.Pressable {...props} /> : <Button variant="outline" {...props} />}
	</DialogPrimitive.Close>
));
DialogClose.displayName = 'DialogClose';

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

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		portalHost?: string;
	} & VariantProps<typeof dialogContentVariants>
>(({ className, size, children, portalHost, ...props }, ref) => {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPortal hostName={portalHost}>
			<DialogOverlay>
				<DialogPrimitive.Content
					ref={ref}
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
					<View className="absolute right-2 top-2">
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
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * NOTE: extra space on right for the close button
 */
const DialogHeader = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col gap-1.5 pl-4 pr-8 text-center sm:text-left', className)}
		{...props}
	/>
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn(
			'flex max-w-full flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end',
			className
		)}
		{...props}
	/>
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<TextRef, SlottableTextProps>(
	({ className, asChild, ...props }, ref) => {
		const Component = asChild ? Slot.Text : Text;

		return (
			<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
				<DialogPrimitive.Title asChild>
					<Component {...props} ref={ref} />
				</DialogPrimitive.Title>
			</TextClassContext.Provider>
		);
	}
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-muted-foreground text-sm', className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogBody = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof ScrollView>) => (
	<ScrollView
		horizontal={false}
		className={cn('flex flex-col gap-2 px-4 py-1', className)}
		{...props}
	/>
);
DialogBody.displayName = 'DialogBody';

/**
 * TODO: it would be nice to pass the onPress handler to the useRootContext hook so that we can
 * detect button presses from anywhere in the dialog.
 */
const DialogAction = React.forwardRef<PressableRef, ButtonProps>(
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

DialogAction.displayName = 'DialogAction';

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
