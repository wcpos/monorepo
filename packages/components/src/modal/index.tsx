import * as React from 'react';
import {
	Platform,
	StyleSheet,
	View,
	ScrollView,
	Pressable,
	type GestureResponderEvent,
} from 'react-native';

import { Primitive } from '@radix-ui/react-primitive';
import { useNavigation, StackActions } from '@react-navigation/native';
import { useAugmentedRef } from '@rn-primitives/hooks';
import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { PressableRef, SlottablePressableProps } from '@rn-primitives/types';

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
	const navigation = useNavigation();
	return (
		<Context.Provider
			value={{ onClose: onClose ? onClose : () => navigation.dispatch(StackActions.pop(1)) }}
		>
			{children}
		</Context.Provider>
	);
};

const ModalClose = React.forwardRef<PressableRef, SlottablePressableProps>(
	({ asChild, onPress: onPressProp, disabled, ...props }, ref) => {
		const augmentedRef = useAugmentedRef({ ref });
		const { onClose } = useRootContext();

		function onPress(ev: GestureResponderEvent) {
			if (onClose) {
				onClose(false);
			}
			onClose(false);
		}

		React.useLayoutEffect(() => {
			if (augmentedRef.current) {
				const augRef = augmentedRef.current as unknown as HTMLButtonElement;
				augRef.type = 'button';
			}
		}, []);

		const Component = asChild ? Slot.Pressable : Pressable;
		return (
			<Component
				ref={augmentedRef}
				onPress={onPress}
				role="button"
				disabled={disabled}
				{...props}
			/>
		);
	}
);

ModalClose.displayName = 'ModalClose';

const ModalOverlayWeb = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => {
	return (
		<View
			className={cn(
				'z-50 bg-black/70 flex justify-center items-center p-2 absolute top-0 right-0 bottom-0 left-0',
				'web:animate-in web:fade-in-0',
				'[&>*:first-child]:max-w-full [&>*:first-child]:max-h-full',
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
			className={cn(
				'z-50 flex bg-black/70 justify-center items-center p-2',
				'[&>*:first-child]:max-w-full [&>*:first-child]:max-h-full',
				className
			)}
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

const modalContentVariants = cva(
	'z-50 max-w-lg max-h-full gap-4 py-4 border border-border web:cursor-default bg-background shadow-lg web:duration-200 rounded-lg',
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
					'z-50 max-w-full max-h-full gap-4 border border-border web:cursor-default bg-background shadow-lg web:duration-200 rounded-lg',
					'web:animate-in web:fade-in-0 web:zoom-in-95',
					className
				)}
				{...props}
			>
				{children}
				<View className="absolute right-2 top-2">
					<ModalClose className="opacity-70 web:transition-opacity web:hover:opacity-100" asChild>
						<IconButton name="xmark" />
					</ModalClose>
				</View>
			</View>
		</ModalOverlay>
	);
});
ModalContent.displayName = 'ModalContent';

const ModalHeader = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col px-4 gap-1.5 text-center sm:text-left', className)}
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
		className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4', className)}
		{...props}
	/>
);
ModalFooter.displayName = 'ModalFooter';

type ModalTitleElement = React.ElementRef<typeof Primitive.h2>;
type PrimitiveHeading2Props = React.ComponentPropsWithoutRef<typeof Primitive.h2>;
interface ModalTitleProps extends PrimitiveHeading2Props {}

const ModalTitle = React.forwardRef<ModalTitleElement, ModalTitleProps>(
	({ className, ...props }, ref) => (
		<TextClassContext.Provider value="text-lg native:text-xl text-foreground font-semibold leading-none">
			<Primitive.h2 id="" {...props} ref={ref} />
		</TextClassContext.Provider>
	)
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
};
