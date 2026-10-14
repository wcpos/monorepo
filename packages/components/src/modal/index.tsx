import * as React from 'react';
import {
	type GestureResponderEvent,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
} from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { router } from 'expo-router';
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

import { Button, type ButtonProps } from '../button';
import { IconButton } from '../icon-button';
import { OVERLAY_FADE, PANEL_SLIDE, PANEL_SLIDE_OUT } from '../lib/motion';
import { OVERLAY_MOTION, SCRIM_WRAPPER } from '../lib/overlay';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { SlottablePressableProps, SlottableTextProps } from '@rn-primitives/types';

interface ModalContextProps {
	onClose: (open: boolean) => void;
}

export type ModalSide = 'center' | 'left' | 'right' | 'bottom';
const SideContext = React.createContext<ModalSide>('center');
const overlayAlignment = {
	center: '',
	right: 'flex-row justify-end items-stretch p-0',
	left: 'flex-row justify-start items-stretch p-0',
	bottom: 'flex-col justify-end items-stretch p-0',
};
const entering = {
	center: FadeIn.duration(OVERLAY_FADE),
	right: SlideInRight.duration(PANEL_SLIDE),
	left: SlideInLeft.duration(PANEL_SLIDE),
	bottom: SlideInDown.duration(PANEL_SLIDE),
};
const exiting = {
	center: FadeOut.duration(OVERLAY_FADE),
	right: SlideOutRight.duration(PANEL_SLIDE_OUT),
	left: SlideOutLeft.duration(PANEL_SLIDE_OUT),
	bottom: SlideOutDown.duration(PANEL_SLIDE_OUT),
};

const Context = React.createContext<ModalContextProps | undefined>(undefined);

const useRootContext = () => {
	const context = React.useContext(Context);
	if (!context) {
		throw new Error('useModalContext must be used within a ModalProvider');
	}
	return context;
};

/**
 * Programmatic access to the enclosing modal, e.g. to close it after a successful save.
 */
function useModal() {
	const { onClose } = useRootContext();
	return React.useMemo(() => ({ close: () => onClose(false) }), [onClose]);
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
	return (
		<Context.Provider value={{ onClose: onClose ? onClose : () => router.back() }}>
			{children}
		</Context.Provider>
	);
}

function ModalClose({ asChild, disabled, ...props }: SlottablePressableProps) {
	const { onClose } = useRootContext();

	function onPress(ev: GestureResponderEvent) {
		if (props?.onPress) {
			props.onPress(ev);
		}
		onClose(false);
	}

	const Component = asChild ? Slot : Button;

	return (
		<Component
			aria-disabled={disabled ?? undefined}
			disabled={disabled ?? undefined}
			onPress={onPress}
			variant="outline"
			{...props}
		/>
	);
}

function ModalAction({
	asChild,
	disabled,
	...props
}: SlottablePressableProps & Partial<ButtonProps>) {
	const Component = asChild ? Slot : Button;

	return (
		<Component
			role="button"
			aria-disabled={disabled ?? undefined}
			disabled={disabled ?? undefined}
			{...props}
		/>
	);
}

function ModalOverlayWeb({
	className,
	side = 'center',
	// Native-only (the wrappers that must fill a full-size phone modal); kept off the DOM.
	fill: _fill,
	...props
}: Omit<React.ComponentPropsWithoutRef<typeof View>, 'onKeyDown' | 'onKeyUp'> & {
	side?: ModalSide;
	fill?: boolean;
}) {
	const { onClose } = useRootContext();
	// Radix adds a content wrapper; SCRIM_WRAPPER sizes it as the panel's box (never
	// `display: contents`, which kills native drag inside the panel).
	return (
		<DialogPrimitive.Root
			asChild
			open
			onOpenChange={(open) => {
				if (!open) onClose(false);
			}}
		>
			<DialogPrimitive.Overlay
				className={cn(
					'web:animate-overlay-in absolute top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center bg-black/70 p-2 [&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
					SCRIM_WRAPPER[side],
					overlayAlignment[side],
					className
				)}
				{...props}
			/>
		</DialogPrimitive.Root>
	);
}

function ModalOverlayNative({
	className,
	children,
	side = 'center',
	fill = false,
	...props
}: Omit<React.ComponentPropsWithoutRef<typeof View>, 'onKeyDown' | 'onKeyUp'> & {
	side?: ModalSide;
	/** A full-size phone modal: the keyboard and motion wrappers must fill the screen too. */
	fill?: boolean;
}) {
	const { onClose } = useRootContext();
	const fullHeight = side === 'left' || side === 'right';
	const wrapperClass = fullHeight ? 'h-full' : fill ? 'h-full w-full' : undefined;
	const insets = useSafeAreaInsets();

	/**
	 * `collapsable={false}` below is load-bearing on Android/Fabric, not a style choice.
	 * This scrim is the screen's root view. Until its background lands it is layout-only,
	 * so Fabric flattens it away and mounts its child straight into RNSScreenContentWrapper;
	 * the commit that gives it a background un-flattens it, and Fabric then re-parents that
	 * child into the newly created view. A re-parent inside a screen that react-native-screens
	 * has put into a removal transition is fatal: `Screen.startRemovalTransition()` calls
	 * `startViewTransition()` on every descendant, so Android leaves `mParent` set on
	 * `removeView` and the follow-up insert throws "View already has a parent"
	 * (software-mansion/react-native-screens#3249). The POS checkout -> receipt
	 * `router.replace` hits exactly that window. Pinning the view means there is no
	 * re-parent to defeat.
	 */
	return (
		<View
			collapsable={false}
			// A bottom sheet carries the bottom inset itself (in card colour); the scrim must not
			// show as a grey bar under it (owner, 2026-10-13). A full-size modal's scrim IS its card
			// (`bg-card`, see ModalContent): it runs under the status bar and pads the inset inside
			// its own colour, because its host no longer does (the POS root never pads an inset:
			// owner, iPad, 2026-10-14; ledger line 17).
			style={[
				StyleSheet.absoluteFill,
				{
					paddingTop: insets.top,
					paddingBottom: side === 'bottom' ? 0 : insets.bottom,
				},
			]}
			className={cn(
				// last-child: the content wrapper; the first child is the scrim Pressable.
				'flex items-center justify-center bg-black/70 p-2 [&>*:last-child]:max-h-full [&>*:last-child]:max-w-full',
				overlayAlignment[side],
				className
			)}
			{...props}
		>
			<Pressable
				style={StyleSheet.absoluteFill}
				onPress={() => onClose(false)}
				accessible={false}
				importantForAccessibility="no"
				accessibilityElementsHidden
			/>
			<KeyboardAvoidingView
				behavior="padding"
				keyboardVerticalOffset={insets.bottom}
				className={wrapperClass}
			>
				<Animated.View entering={entering[side]} exiting={exiting[side]} className={wrapperClass}>
					<>{children}</>
				</Animated.View>
			</KeyboardAvoidingView>
		</View>
	);
}

const ModalOverlay = Platform.select({
	web: ModalOverlayWeb,
	default: ModalOverlayNative,
});

const modalContentVariants = cva(
	'border-border web:cursor-default bg-card web:duration-200 max-h-full max-w-lg gap-4 rounded-lg border py-4 shadow-lg',
	{
		variants: {
			size: {
				default: 'w-96',
				xs: 'w-64',
				sm: 'w-80',
				lg: 'w-lg',
				xl: 'w-160',
				'2xl': 'w-200',
				full: 'w-full',
			},
			side: {
				center: '',
				right: 'h-full max-h-full max-w-full rounded-none border-r-0',
				left: 'h-full max-h-full max-w-full rounded-none border-l-0',
				// Native keeps its own cap; on web the cap sits on the Radix wrapper (SCRIM_WRAPPER).
				bottom: 'web:max-h-full max-h-[85%] w-full max-w-full rounded-none border-b-0',
			},
		},
		defaultVariants: {
			size: 'default',
		},
	}
);

function ModalContent({
	className,
	size,
	side = 'center',
	children,
	...props
}: React.ComponentPropsWithoutRef<typeof View> &
	Omit<VariantProps<typeof modalContentVariants>, 'side'> & { side?: ModalSide }) {
	const Content = Platform.OS === 'web' ? DialogPrimitive.Content : View;
	const insets = useSafeAreaInsets();
	// A full-size modal on a phone IS the screen (owner, 2026-10-13): no scrim gutter, no
	// rounded card floating over a grey bar, and the card colour runs to the safe-area edges.
	const fullScreen = size === 'full' && Platform.OS !== 'web';
	// A native bottom sheet paints the bottom inset itself (see ModalOverlayNative).
	const sheetInset =
		side === 'bottom' && Platform.OS !== 'web' ? { paddingBottom: insets.bottom } : undefined;
	return (
		<ModalOverlay
			side={side}
			fill={fullScreen}
			className={fullScreen ? 'bg-card items-stretch justify-start p-0' : undefined}
		>
			<Content
				className={cn(
					modalContentVariants({ size, side }),
					side === 'center'
						? 'web:cursor-default border-border bg-card z-50 max-h-full max-w-full gap-4 rounded-lg border shadow-lg'
						: 'z-50',
					// The title sits 8 under the status bar and the last row 8 above the bottom inset.
					fullScreen && 'h-full w-full max-w-full rounded-none border-0 py-2 shadow-none',
					OVERLAY_MOTION[side].enter,
					className
				)}
				style={sheetInset}
				{...props}
			>
				<SideContext.Provider value={side}>{children}</SideContext.Provider>
				{/* Borderless and muted, 44 pt: the child's `default` variant overrides ModalClose's
				    `outline`. Full screen lifts it to centre on the title row. */}
				<View className={cn('absolute right-2', fullScreen ? 'top-0' : 'top-2')}>
					<ModalClose asChild>
						<IconButton name="xmark" variant="default" />
					</ModalClose>
				</View>
			</Content>
		</ModalOverlay>
	);
}

/**
 * NOTE: extra space on right for the close button
 */
function ModalHeader({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
	return (
		<View
			className={cn('flex flex-col gap-1.5 pr-8 pl-4 text-center sm:text-left', className)}
			{...props}
		/>
	);
}

function ModalBody({ className, ...props }: React.ComponentPropsWithoutRef<typeof ScrollView>) {
	const side = React.useContext(SideContext);
	return (
		<ScrollView
			horizontal={false}
			className={cn('flex flex-col gap-2 px-4 py-1', side !== 'center' && 'flex-1', className)}
			{...props}
		/>
	);
}

function ModalFooter({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
	const side = React.useContext(SideContext);
	return (
		<View
			className={cn(
				'flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end',
				side !== 'center' && 'border-border border-t pt-4',
				className
			)}
			{...props}
		/>
	);
}

function ModalTitle({ className, asChild, ...props }: SlottableTextProps) {
	const Component = asChild ? Slot : Text;
	const title = <Component {...props} />;

	return (
		<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
			{/* On web the panel is a Radix dialog; slotting the title gives it aria-labelledby. */}
			{Platform.OS === 'web' ? (
				<DialogPrimitive.Title asChild>{title}</DialogPrimitive.Title>
			) : (
				title
			)}
		</TextClassContext.Provider>
	);
}

export {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalFooter,
	ModalTitle,
	ModalBody,
	ModalClose,
	ModalAction,
	useModal,
	Modal as Panel,
	ModalContent as PanelContent,
	ModalHeader as PanelHeader,
	ModalBody as PanelBody,
	ModalFooter as PanelFooter,
	ModalTitle as PanelTitle,
	ModalClose as PanelClose,
	ModalAction as PanelAction,
	useModal as usePanel,
};
