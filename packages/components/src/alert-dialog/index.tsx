import * as React from 'react';
import type { GestureResponderEvent, ViewProps } from 'react-native';
import { View } from 'react-native';

import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import { Slot } from '@rn-primitives/slot';

import { Button, type ButtonProps } from '../button';
import { useIsPhone } from '../lib/device';
import {
	OVERLAY_MOTION,
	type OverlayScrimProps,
	OverlayShell,
	useOverlayPresentation,
} from '../lib/overlay';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = AlertDialogPrimitive.Overlay;

function AlertDialogContent({
	className,
	portalHost,
	inline,
	...props
}: AlertDialogPrimitive.ContentProps & { portalHost?: string; inline?: boolean }) {
	const { open } = AlertDialogPrimitive.useRootContext();
	const phone = useIsPhone();
	const presentation = phone ? 'bottom' : 'center';
	// Confirmations paint above z-60 panels in the same portal host.
	const Scrim = React.useMemo(() => {
		function Scrim(p: OverlayScrimProps) {
			return <AlertDialogPrimitive.Overlay {...p} className={cn('z-70', p.className)} />;
		}
		return Scrim;
	}, []);
	const shell = (
		<OverlayShell presentation={presentation} open={open} Scrim={Scrim} testID={props.testID}>
			<AlertDialogPrimitive.Content
				className={cn(
					'bg-card border-border z-70 max-h-full max-w-full gap-4 border py-4',
					presentation === 'center'
						? 'w-full max-w-105 rounded-lg'
						: 'w-full rounded-t-2xl border-x-0 border-t border-b-0',
					open ? OVERLAY_MOTION[presentation].enter : OVERLAY_MOTION[presentation].exit,
					className
				)}
				{...props}
			/>
		</OverlayShell>
	);
	return inline ? shell : <AlertDialogPortal hostName={portalHost}>{shell}</AlertDialogPortal>;
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-col gap-2 px-4', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
	const presentation = useOverlayPresentation() ?? 'center';
	return (
		<View
			className={cn(
				'flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end',
				presentation === 'bottom' && 'border-border border-t pt-4',
				className
			)}
			{...props}
		/>
	);
}

function AlertDialogTitle({ className, asChild, ...props }: AlertDialogPrimitive.TitleProps) {
	const Component = asChild ? Slot : Text;

	return (
		<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
			<AlertDialogPrimitive.Title asChild>
				<Component {...props} />
			</AlertDialogPrimitive.Title>
		</TextClassContext.Provider>
	);
}

function AlertDialogDescription({
	className,
	asChild,
	...props
}: AlertDialogPrimitive.DescriptionProps) {
	const Component = asChild ? Slot : Text;

	return (
		<TextClassContext.Provider value="text-base text-foreground leading-5">
			<AlertDialogPrimitive.Description asChild>
				<Component {...props} />
			</AlertDialogPrimitive.Description>
		</TextClassContext.Provider>
	);
}

function AlertDialogAction({
	asChild,
	disabled,
	...props
}: AlertDialogPrimitive.ActionProps & Partial<ButtonProps>) {
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

function AlertDialogCancel({
	asChild,
	disabled,
	onPress: userOnPress,
	...props
}: AlertDialogPrimitive.CancelProps) {
	const { onOpenChange } = AlertDialogPrimitive.useRootContext();

	function onPress(ev: GestureResponderEvent) {
		if (userOnPress) {
			userOnPress(ev);
		}
		onOpenChange(false);
	}

	return asChild ? (
		<Slot
			onPress={onPress}
			aria-disabled={disabled ?? undefined}
			role="button"
			disabled={disabled ?? undefined}
			{...props}
		/>
	) : (
		<Button
			aria-disabled={disabled ?? undefined}
			disabled={disabled ?? undefined}
			onPress={onPress}
			variant="outline"
			{...props}
		/>
	);
}

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
