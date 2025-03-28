import * as React from 'react';
import { Platform, StyleSheet, View, ScrollView, type GestureResponderEvent } from 'react-native';

import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { router } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../button';
import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { ButtonProps } from '../button';
import type { PressableRef, SlottableTextProps, TextRef } from '@rn-primitives/types';

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

const ModalClose = React.forwardRef<PressableRef, ButtonProps>(
	({ asChild, disabled, ...props }, ref) => {
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
				ref={ref}
				aria-disabled={disabled ?? undefined}
				disabled={disabled ?? undefined}
				onPress={onPress}
				variant="outline"
				{...props}
			/>
		);
	}
);

ModalClose.displayName = 'ModalClose';

const ModalAction = React.forwardRef<PressableRef, ButtonProps>(
	({ asChild, disabled, ...props }, ref) => {
		const Component = asChild ? Slot.Pressable : Button;

		return (
			<Component
				ref={ref}
				role="button"
				aria-disabled={disabled ?? undefined}
				disabled={disabled ?? undefined}
				{...props}
			/>
		);
	}
);

ModalAction.displayName = 'ModalAction';

const ModalOverlayWeb = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => {
	return (
		<View
			className={cn(
				'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/70 p-2',
				'web:animate-in web:fade-in-0',
				'[&>*:first-child]:max-h-full [&>*:first-child]:max-w-full',
				className
			)}
			{...props}
			ref={ref}
		/>
	);
});

ModalOverlayWeb.displayName = 'ModalOverlayWeb';

const ModalOverlayNative = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View>
>(({ className, children, ...props }, ref) => {
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
			ref={ref}
		>
			<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.bottom}>
				<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
					<>{children}</>
				</Animated.View>
			</KeyboardAvoidingView>
		</View>
	);
});

ModalOverlayNative.displayName = 'ModalOverlayNative';

const ModalOverlay = Platform.select({
	web: ModalOverlayWeb,
	default: ModalOverlayNative,
});

const modalContentVariants = cva(
	'border-border web:cursor-default bg-background web:duration-200 max-h-full max-w-lg gap-4 rounded-lg border py-4 shadow-lg',
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

const ModalContent = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View> & VariantProps<typeof modalContentVariants>
>(({ className, size, children, ...props }, ref) => {
	return (
		<ModalOverlay>
			<View
				ref={ref}
				className={cn(
					modalContentVariants({ size }),
					'web:cursor-default web:duration-200 border-border bg-background z-50 max-h-full max-w-full gap-4 rounded-lg border shadow-lg',
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
});
ModalContent.displayName = 'ModalContent';

/**
 * NOTE: extra space on right for the close button
 */
const ModalHeader = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col gap-1.5 pl-4 pr-8 text-center sm:text-left', className)}
		{...props}
	/>
);
ModalHeader.displayName = 'ModalHeader';

const ModalBody = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof ScrollView>) => (
	<ScrollView
		horizontal={false}
		className={cn('flex flex-col gap-2 px-4 py-1', className)}
		{...props}
	/>
);
ModalBody.displayName = 'ModalBody';

const ModalFooter = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end', className)}
		{...props}
	/>
);
ModalFooter.displayName = 'ModalFooter';

const ModalTitle = React.forwardRef<TextRef, SlottableTextProps>(
	({ className, asChild, ...props }, ref) => {
		const Component = asChild ? Slot.Text : Text;

		return (
			<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
				<Component {...props} ref={ref} />
			</TextClassContext.Provider>
		);
	}
);
ModalTitle.displayName = 'ModalTitle';

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
