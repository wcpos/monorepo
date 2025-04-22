import * as React from 'react';
import type { GestureResponderEvent } from 'react-native';

import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import { Platform, View } from '@rn-primitives/core';
import { FadeIn, FadeOut, ZoomIn, ZoomOut } from '@rn-primitives/core/dist/native/reanimated';
import { mergeProps } from '@rn-primitives/utils';

import { Button } from '../button';
import { cn } from '../lib/utils';

import type { ButtonProps } from '../button';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const OVERLAY_NATIVE_PROPS = {
	isAnimated: true,
	entering: FadeIn,
	exiting: FadeOut.duration(150),
};

function AlertDialogOverlay({ className, native, ...props }: AlertDialogPrimitive.OverlayProps) {
	return (
		<AlertDialogPrimitive.Overlay
			native={mergeProps(OVERLAY_NATIVE_PROPS, native)}
			className={cn(
				// z-50 important for exit animation on native
				'bottom-0 left-0 right-0 top-0 z-50',
				Platform.select({
					web: 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed bg-black/80',
					native: 'absolute flex items-center justify-center bg-black/50 p-2 dark:bg-black/80',
				}),
				className
			)}
			{...props}
		/>
	);
}

const CONTENT_NATIVE_PROPS = {
	isAnimated: true,
	entering: ZoomIn.duration(200).withInitialValues({ transform: [{ scale: 0.85 }] }),
	exiting: ZoomOut.duration(400),
};

function AlertDialogContent({
	className,
	native: { portalHost, ...nativeProp } = {},
	...props
}: Omit<AlertDialogPrimitive.ContentProps, 'native'> & {
	native?: AlertDialogPrimitive.ContentProps['native'] & { portalHost?: string };
}) {
	return (
		<AlertDialogPortal native={portalHost ? { hostName: portalHost } : undefined}>
			<AlertDialogOverlay>
				<AlertDialogPrimitive.Content asChild={Platform.OS === 'web'}>
					{/* AlertDialogPrimitive.Content uses `nativeID` for accessibility, so it prevents the entering animation from working https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/#remarks */}
					<View
						className={cn(
							'bg-background border-border z-50 max-w-lg gap-4 rounded-lg border py-4 shadow-lg',
							Platform.select({
								web: 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed left-[50%] top-[50%] grid translate-x-[-50%] translate-y-[-50%] duration-200',
								native: '',
							}),
							className
						)}
						native={mergeProps(CONTENT_NATIVE_PROPS, nativeProp)}
						{...props}
					/>
				</AlertDialogPrimitive.Content>
			</AlertDialogOverlay>
		</AlertDialogPortal>
	);
}

const AlertDialogHeader = ({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof View>) => (
	<View className={cn('flex flex-col gap-2 px-4', className)} {...props} />
);

const AlertDialogFooter = ({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof View>) => (
	<View
		className={cn('flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end', className)}
		{...props}
	/>
);

const AlertDialogTitle = ({ className, ...props }: AlertDialogPrimitive.TitleProps) => {
	return (
		<AlertDialogPrimitive.Title
			className={cn('native:text-xl text-foreground text-lg font-semibold leading-none', className)}
			{...props}
		/>
	);
};

const AlertDialogDescription = ({ className, ...props }: AlertDialogPrimitive.DescriptionProps) => {
	return (
		<AlertDialogPrimitive.Description
			className={cn('native:text-base text-foreground text-sm leading-5', className)}
			{...props}
		/>
	);
};

const AlertDialogAction = ({ disabled, ...props }: ButtonProps) => {
	return (
		<Button aria-disabled={disabled ?? undefined} disabled={disabled ?? undefined} {...props} />
	);
};

const AlertDialogCancel = ({ disabled, ...props }: ButtonProps) => {
	const { onOpenChange } = AlertDialogPrimitive.useRootContext();

	function onPress(ev: GestureResponderEvent) {
		if (props?.onPress) {
			props.onPress(ev);
		}
		onOpenChange(false);
	}

	return (
		<Button
			aria-disabled={disabled ?? undefined}
			disabled={disabled ?? undefined}
			onPress={onPress}
			variant="outline"
			{...props}
		/>
	);
};

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
