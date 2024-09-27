import * as React from 'react';
import { Platform, StyleSheet, View, ScrollView } from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const useRootContext = DialogPrimitive.useRootContext;

const DialogOverlayWeb = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPrimitive.Overlay
			className={cn(
				'bg-black/70 flex justify-center items-center p-2 absolute top-0 right-0 bottom-0 left-0',
				open ? 'web:animate-in web:fade-in-0' : 'web:animate-out web:fade-out-0',
				'[&>*:first-child]:max-w-full [&>*:first-child]:max-h-full',
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
	return (
		<DialogPrimitive.Overlay
			style={StyleSheet.absoluteFill}
			className={cn(
				'flex bg-black/70 justify-center items-center p-2',
				'[&>*:first-child]:max-w-full [&>*:first-child]:max-h-full',
				className
			)}
			{...props}
			ref={ref}
		>
			<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
				<>{children}</>
			</Animated.View>
		</DialogPrimitive.Overlay>
	);
});

DialogOverlayNative.displayName = 'DialogOverlayNative';

const DialogOverlay = Platform.select({
	web: DialogOverlayWeb,
	default: DialogOverlayNative,
});

const dialogContentVariants = cva(
	'z-50 max-w-full max-h-full gap-4 py-4 border border-border web:cursor-default bg-background shadow-lg web:duration-200 rounded-lg',
	{
		variants: {
			size: {
				default: 'w-96',
				xs: 'w-64',
				sm: 'w-80',
				lg: 'w-128',
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
						<DialogPrimitive.Close
							className="opacity-70 web:transition-opacity web:hover:opacity-100"
							asChild
						>
							<IconButton name="xmark" />
						</DialogPrimitive.Close>
					</View>
				</DialogPrimitive.Content>
			</DialogOverlay>
		</DialogPortal>
	);
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col px-4 gap-1.5 text-center sm:text-left', className)}
		{...props}
	/>
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4', className)}
		{...props}
	/>
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<TextClassContext.Provider value="text-lg native:text-xl text-foreground font-semibold leading-none">
		<DialogPrimitive.Title ref={ref} className={cn(className)} {...props} />
	</TextClassContext.Provider>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-sm native:text-base text-muted-foreground', className)}
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
};
