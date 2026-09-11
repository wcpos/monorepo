import * as React from 'react';
import { Platform, ScrollView, ScrollViewProps, StyleSheet, View, ViewProps } from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, {
	FadeIn,
	FadeOut,
	SlideInDown,
	SlideInLeft,
	SlideInRight,
	SlideOutDown,
	SlideOutLeft,
	SlideOutRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';

import { Button } from '../button';
import { IconButton } from '../icon-button';
import { OVERLAY_FADE_MS, PANEL_SLIDE_MS, PANEL_SLIDE_OUT_MS } from '../lib/overlay-motion';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { SlottablePressableProps, SlottableTextProps } from '@rn-primitives/types';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

type DialogSide = 'center' | 'left' | 'right' | 'bottom';
const SideContext = React.createContext<DialogSide>('center');
const overlayAlignment = {
	center: '',
	right: 'flex-row justify-end items-stretch p-0',
	left: 'flex-row justify-start items-stretch p-0',
	bottom: 'flex-col justify-end items-stretch p-0',
};
const entering = {
	center: FadeIn.duration(OVERLAY_FADE_MS),
	right: SlideInRight.duration(PANEL_SLIDE_MS),
	left: SlideInLeft.duration(PANEL_SLIDE_MS),
	bottom: SlideInDown.duration(PANEL_SLIDE_MS),
};
const exiting = {
	center: FadeOut.duration(OVERLAY_FADE_MS),
	right: SlideOutRight.duration(PANEL_SLIDE_OUT_MS),
	left: SlideOutLeft.duration(PANEL_SLIDE_OUT_MS),
	bottom: SlideOutDown.duration(PANEL_SLIDE_OUT_MS),
};

/**
 * @TODO - it would be good to expand the Dialog context to include button presses from the Action component.
 */
const useRootContext = DialogPrimitive.useRootContext;

function DialogOverlayWeb({
	className,
	side = 'center',
	...props
}: DialogPrimitive.OverlayProps & { side?: DialogSide }) {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPrimitive.Overlay
			className={cn(
				'absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center bg-black/70 p-2 [&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				open ? 'web:animate-in web:fade-in-0' : 'web:animate-out web:fade-out-0',
				overlayAlignment[side],
				className
			)}
			{...props}
		/>
	);
}

function DialogOverlayNative({
	className,
	children,
	side = 'center',
	...props
}: DialogPrimitive.OverlayProps & { side?: DialogSide }) {
	const insets = useSafeAreaInsets();
	const fullHeight = side === 'left' || side === 'right';

	return (
		<DialogPrimitive.Overlay
			style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
			className={cn(
				'flex items-center justify-center bg-black/70 p-2 [&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				overlayAlignment[side],
				className
			)}
			{...props}
		>
			<KeyboardAvoidingView
				behavior="padding"
				keyboardVerticalOffset={insets.bottom}
				className={fullHeight ? 'h-full' : undefined}
			>
				<Animated.View
					entering={entering[side]}
					exiting={exiting[side]}
					className={fullHeight ? 'h-full' : undefined}
				>
					<>{children}</>
				</Animated.View>
			</KeyboardAvoidingView>
		</DialogPrimitive.Overlay>
	);
}

function DialogClose({ asChild, ...props }: DialogPrimitive.CloseProps) {
	return (
		<DialogPrimitive.Close asChild>
			{asChild ? <Slot {...props} /> : <Button variant="outline" {...props} />}
		</DialogPrimitive.Close>
	);
}

const DialogOverlay = Platform.select({
	web: DialogOverlayWeb,
	default: DialogOverlayNative,
});

const dialogContentVariants = cva(
	'border-border web:cursor-default bg-card z-60 max-h-full max-w-full gap-4 rounded-lg border py-4',
	{
		variants: {
			size: {
				default: 'w-96',
				xs: 'w-64',
				sm: 'w-80',
				md: 'w-96',
				lg: 'w-lg',
				xl: 'w-160',
				'2xl': 'w-200',
				full: 'w-full',
			},
			side: {
				center: '',
				right: 'web:slide-in-from-right h-full max-h-full max-w-full rounded-none border-r-0',
				left: 'web:slide-in-from-left h-full max-h-full max-w-full rounded-none border-l-0',
				bottom: 'web:slide-in-from-bottom max-h-[85%] w-full max-w-full rounded-none border-b-0',
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
	side = 'center',
	children,
	portalHost,
	...props
}: DialogPrimitive.ContentProps &
	Omit<VariantProps<typeof dialogContentVariants>, 'side'> & {
		side?: DialogSide;
		portalHost?: string;
	}) {
	const { open } = DialogPrimitive.useRootContext();
	return (
		<DialogPortal hostName={portalHost}>
			<DialogOverlay side={side}>
				<DialogPrimitive.Content
					className={cn(
						dialogContentVariants({ size, side }),
						open
							? side === 'center'
								? 'web:animate-in web:fade-in-0 web:zoom-in-95'
								: 'web:animate-in'
							: side === 'center'
								? 'web:animate-out web:fade-out-0 web:zoom-out-95'
								: 'web:animate-out web:fade-out-0',
						className
					)}
					{...props}
				>
					<SideContext.Provider value={side}>{children}</SideContext.Provider>
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
	const side = React.useContext(SideContext);
	return (
		<View
			className={cn(
				'flex max-w-full flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end',
				side !== 'center' && 'border-border border-t pt-4',
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

/**
 * DialogTitle with proper text color for all themes
 */
function DialogTitle({ className, asChild, ...props }: SlottableTextProps) {
	const Component = asChild ? Slot : Text;

	return (
		<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
			<DialogPrimitive.Title asChild>
				<Component className={className} {...props} />
			</DialogPrimitive.Title>
		</TextClassContext.Provider>
	);
}

function DialogBody({ className, ...props }: ScrollViewProps) {
	const side = React.useContext(SideContext);
	return (
		<ScrollView
			horizontal={false}
			className={cn('flex flex-col gap-2 px-4 py-1', side !== 'center' && 'flex-1', className)}
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
		<Slot
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
