import * as React from 'react';
import { type GestureResponderEvent, Platform, ScrollView, StyleSheet, View } from 'react-native';

import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';

import { Button } from '../button';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { SlottablePressableProps, SlottableTextProps } from '@rn-primitives/types';

interface ModalContextProps {
	onClose: (open: boolean) => void;
}

const Context = React.createContext<ModalContextProps | undefined>(undefined);

const useRootContext = () => {
	const context = React.useContext(Context);
	if (!context) {
		throw new Error('useModalContext must be used within a ModalProvider');
	}
	return context;
};

const Modal = ({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) => {
	return (
		<Context.Provider value={{ onClose: onClose ? onClose : () => router.back() }}>
			{children}
		</Context.Provider>
	);
};

function ModalClose({ asChild, disabled, ...props }: SlottablePressableProps) {
	const { onClose } = useRootContext();

	function onPress(ev: GestureResponderEvent) {
		if (props?.onPress) {
			props.onPress(ev);
		}
		onClose(false);
	}

	const Component = asChild ? Slot.Pressable : Button;

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

function ModalAction({ asChild, disabled, ...props }: SlottablePressableProps) {
	const Component = asChild ? Slot.Pressable : Button;

	return (
		<Component
			role="button"
			aria-disabled={disabled ?? undefined}
			disabled={disabled ?? undefined}
			{...props}
		/>
	);
}

function ModalOverlayWeb({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
	return (
		<View
			className={cn(
				'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/70 p-2',
				'web:animate-in web:fade-in-0',
				'[&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				className
			)}
			{...props}
		/>
	);
}

function ModalOverlayNative({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<typeof View>) {
	const insets = useSafeAreaInsets();

	return (
		<View
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
				full: 'w-full',
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
	children,
	...props
}: React.ComponentPropsWithoutRef<typeof View> & VariantProps<typeof modalContentVariants>) {
	return (
		<ModalOverlay>
			<View
				className={cn(
					modalContentVariants({ size }),
					'web:cursor-default web:duration-200 border-border bg-card z-50 max-h-full max-w-full gap-4 rounded-lg border shadow-lg',
					'web:animate-in web:fade-in-0 web:zoom-in-95',
					className
				)}
				{...props}
			>
				{children}
				<View className="absolute right-2 top-2">
					<ModalClose className="web:transition-opacity web:hover:opacity-100 opacity-70" asChild>
						<IconButton name="xmark" />
					</ModalClose>
				</View>
			</View>
		</ModalOverlay>
	);
}

/**
 * NOTE: extra space on right for the close button
 */
function ModalHeader({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
	return (
		<View
			className={cn('flex flex-col gap-1.5 pl-4 pr-8 text-center sm:text-left', className)}
			{...props}
		/>
	);
}

function ModalBody({ className, ...props }: React.ComponentPropsWithoutRef<typeof ScrollView>) {
	return (
		<ScrollView
			horizontal={false}
			className={cn('flex flex-col gap-2 px-4 py-1', className)}
			{...props}
		/>
	);
}

function ModalFooter({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) {
	return (
		<View
			className={cn('flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end', className)}
			{...props}
		/>
	);
}

function ModalTitle({ className, asChild, ...props }: SlottableTextProps) {
	const Component = asChild ? Slot.Text : Text;

	return (
		<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
			<Component {...props} />
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
};
