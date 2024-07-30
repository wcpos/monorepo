import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { cn } from '../lib/utils';

const ModalOverlayWeb = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => {
	return (
		<View
			className={cn(
				'z-50 bg-black/70 flex justify-center items-center p-2 absolute top-0 right-0 bottom-0 left-0',
				'web:animate-in web:fade-in-0',
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
	return (
		<View
			style={StyleSheet.absoluteFill}
			className={cn('z-50 flex bg-black/70 justify-center items-center p-2', className)}
			{...props}
			ref={ref}
		>
			<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
				<>{children}</>
			</Animated.View>
		</View>
	);
});

ModalOverlayNative.displayName = 'ModalOverlayNative';

const ModalOverlay = Platform.select({
	web: ModalOverlayWeb,
	default: ModalOverlayNative,
});

const ModalContent = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View>
>(({ className, children, ...props }, ref) => {
	return (
		<View
			ref={ref}
			className={cn(
				'z-50 max-w-lg gap-4 border border-border web:cursor-default bg-background p-6 shadow-lg web:duration-200 rounded-lg',
				'web:animate-in web:fade-in-0 web:zoom-in-95',
				className
			)}
			{...props}
		>
			{children}
		</View>
	);
});
ModalContent.displayName = 'ModalContent';

export { ModalOverlay, ModalContent };
