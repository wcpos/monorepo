import * as React from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';

import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import { Slot } from '@rn-primitives/slot';

import { Button } from '../button';
import { useDialogLabels } from '../dialog/labels';
import { useIsPhone } from '../lib/device';
import {
	OVERLAY_MOTION,
	type OverlayScrimProps,
	OverlayShell,
	useOverlayPresentation,
	useSheetInset,
} from '../lib/overlay';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';
import { TEXT_LADDER } from '../text/ladder';

import type { FooterButton } from '../dialog';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = AlertDialogPrimitive.Overlay;

function AlertDialogContent({
	className,
	portalHost,
	inline,
	style,
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
	// The bottom sheet paints its own inset; 16 keeps the `py-4` the class gives.
	const inset = useSheetInset(16, presentation);
	const shell = (
		<OverlayShell
			presentation={presentation}
			open={open}
			Scrim={Scrim}
			// A confirmation never dismisses from its scrim.
			blocking
			testID={props.testID}
		>
			<AlertDialogPrimitive.Content
				className={cn(
					'bg-card border-border z-70 max-h-full max-w-full gap-4 border py-4',
					presentation === 'center'
						? 'w-full max-w-105 rounded-lg'
						: 'w-full rounded-t-2xl border-x-0 border-t border-b-0',
					open ? OVERLAY_MOTION[presentation].enter : OVERLAY_MOTION[presentation].exit,
					className
				)}
				// A caller's style adds to the inset; it never replaces it.
				style={[inset, style]}
				{...props}
			/>
		</OverlayShell>
	);
	return inline ? shell : <AlertDialogPortal hostName={portalHost}>{shell}</AlertDialogPortal>;
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
	return <View className={cn('flex flex-col gap-2 px-4', className)} {...props} />;
}

export type AlertDialogFooterProps = {
	/** The confirm: solid red only for a loss, otherwise primary. */
	confirm: FooterButton & { destructive?: boolean };
	/** The translated Cancel, present unless false. */
	cancel?: boolean | Pick<FooterButton, 'testID' | 'onPress' | 'disabled'>;
	/** One alternative to the confirm (outline): the Sign out anyway beside Close register. */
	secondary?: FooterButton;
	size?: 'default' | 'lg';
	testID?: string;
};
function AlertDialogFooter({
	confirm,
	secondary,
	cancel = true,
	size = 'default',
	testID,
}: AlertDialogFooterProps) {
	const presentation = useOverlayPresentation() ?? 'center';
	const phone = useIsPhone();
	const labels = useDialogLabels();
	const { onOpenChange } = AlertDialogPrimitive.useRootContext();
	const { label, icon, destructive, ...button } = confirm;
	const buttonClass = cn(phone && 'w-full', size === 'lg' && !cancel && 'flex-1');
	const action = (
		<Button
			{...button}
			leftIcon={icon}
			size={size}
			variant={destructive ? 'destructive' : 'default'}
			className={buttonClass}
		>
			{label}
		</Button>
	);
	const { label: alternativeLabel, icon: alternativeIcon, ...alternativeProps } = secondary ?? {};
	const alternative = secondary ? (
		<Button
			{...alternativeProps}
			leftIcon={alternativeIcon}
			variant="outline"
			size={size}
			className={buttonClass}
		>
			{alternativeLabel}
		</Button>
	) : null;
	const cancelProps = typeof cancel === 'object' ? cancel : {};
	const dismiss = cancel ? (
		<Button
			{...cancelProps}
			variant="outline"
			size={size}
			className={buttonClass}
			onPress={(event) => {
				cancelProps.onPress?.(event);
				onOpenChange(false);
			}}
		>
			{labels.cancel}
		</Button>
	) : null;
	return (
		<View
			testID={testID}
			className={cn(
				'flex max-w-full gap-2 px-4',
				phone ? 'flex-col' : 'flex-row flex-wrap items-center justify-end',
				presentation !== 'center' && 'border-border border-t pt-4'
			)}
		>
			{phone ? (
				<>
					{action}
					{alternative}
					{dismiss}
				</>
			) : (
				<>
					{dismiss}
					{alternative}
					{action}
				</>
			)}
		</View>
	);
}

function AlertDialogTitle({ className, asChild, ...props }: AlertDialogPrimitive.TitleProps) {
	const Component = asChild ? Slot : Text;

	return (
		<TextClassContext.Provider value={`${TEXT_LADDER.dialog} text-foreground leading-none`}>
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

export {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
