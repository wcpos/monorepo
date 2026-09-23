import * as React from 'react';
import { ScrollView, type ScrollViewProps, View, type ViewProps } from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import { Slot } from '@rn-primitives/slot';
import { router } from 'expo-router';

import { Button } from '../../button';
import { IconButton } from '../../icon-button';
import { useIsPhone } from '../../lib/device';
import { OVERLAY_MOTION, OverlayShell, useOverlay } from '../../lib/overlay';
import { usePortalContainer } from '../../lib/portal-container';
import { cn } from '../../lib/utils';
import { Text, TextClassContext } from '../../text';

import type { OverlayPresentation } from '../../lib/overlay';
import type { SlottablePressableProps, SlottableTextProps } from '@rn-primitives/types';
export type DialogSide = 'center' | 'left' | 'right' | 'bottom';
export type DialogSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
export type DialogProps = DialogPrimitive.RootProps & { route?: boolean; onClose?: () => void };
export type DialogContentProps = Omit<DialogPrimitive.ContentProps, 'children'> & {
	side?: DialogSide;
	size?: DialogSize;
	portalHost?: string;
	inline?: boolean;
	closeLabel?: string;
	closeButtonProps?: Omit<React.ComponentProps<typeof IconButton>, 'name'>;
	children: React.ReactNode;
};
const RouteContext = React.createContext({ route: false });
const byPresentation: Record<OverlayPresentation, string> = {
	center: 'rounded-lg border',
	left: 'h-full rounded-none border-r',
	right: 'h-full rounded-none border-l',
	page: 'h-full w-full rounded-none border-0',
	bottom: 'w-full max-h-[92%] rounded-t-2xl border-t',
};
const sizes: Record<DialogSize, string> = {
	xs: 'w-64',
	sm: 'w-80',
	md: 'w-96',
	lg: 'w-lg',
	xl: 'w-160',
	'2xl': 'w-200',
	full: 'w-full',
};
export function Dialog(allProps: DialogProps): React.JSX.Element {
	const { route = false, onClose, children, ...props } = allProps;
	return (
		<RouteContext.Provider value={{ route }}>
			<DialogPrimitive.Root
				{...props}
				{...(route
					? {
							open: true,
							asChild: React.Children.count(children) === 1 && React.isValidElement(children),
							onOpenChange: (next: boolean) => {
								if (!next) {
									if (onClose) onClose();
									else router.back();
								}
							},
						}
					: {})}
			>
				{children}
			</DialogPrimitive.Root>
		</RouteContext.Provider>
	);
}
export const DialogTrigger = DialogPrimitive.Trigger;
export function useDialog(): { open: boolean; close: () => void } {
	const { open, onOpenChange } = DialogPrimitive.useRootContext();
	return { open, close: () => onOpenChange(false) };
}
export function DialogContent(allProps: DialogContentProps): React.JSX.Element {
	const { side = 'center', portalHost, inline, testID, ...props } = allProps;
	const phone = useIsPhone();
	const presentation: OverlayPresentation =
		phone && (side === 'left' || side === 'right') ? 'page' : side;
	const { route } = React.useContext(RouteContext);
	const { open } = DialogPrimitive.useRootContext();
	const container = usePortalContainer(portalHost);
	const shell = (
		<OverlayShell
			Scrim={DialogPrimitive.Overlay}
			presentation={presentation}
			open={open}
			pinned={route}
			testID={testID}
		>
			<DialogPanel testID={testID} {...props} />
		</OverlayShell>
	);
	return (inline ?? route) ? (
		shell
	) : (
		<DialogPrimitive.Portal hostName={portalHost} container={container}>
			{shell}
		</DialogPrimitive.Portal>
	);
}
function DialogPanel(allProps: DialogContentProps) {
	const { size = 'md', className, children, ...rest } = allProps;
	const { closeLabel, closeButtonProps, onOpenAutoFocus, testID, ...props } = rest;
	const { presentation, deferAutoFocus, onPanelNode } = useOverlay();
	const { open } = DialogPrimitive.useRootContext();
	const sizeClass =
		presentation === 'center' || presentation === 'left' || presentation === 'right'
			? sizes[size]
			: undefined;
	return (
		<DialogPrimitive.Content
			ref={onPanelNode as unknown as React.Ref<DialogPrimitive.ContentRef>}
			onOpenAutoFocus={
				deferAutoFocus
					? (event) => {
							event.preventDefault();
							onOpenAutoFocus?.(event);
						}
					: onOpenAutoFocus
			}
			className={cn(
				'bg-card border-border web:cursor-default z-60 max-h-full max-w-full gap-4 py-4',
				byPresentation[presentation],
				sizeClass,
				open ? OVERLAY_MOTION[presentation].enter : OVERLAY_MOTION[presentation].exit,
				className
			)}
			testID={testID}
			{...props}
		>
			{children}
			<View className="absolute top-2 right-2">
				<DialogClose asChild>
					<IconButton
						name="xmark"
						aria-label={closeLabel ?? 'Close'}
						testID={closeButtonProps?.testID ?? (testID ? `${testID}-close` : undefined)}
						{...closeButtonProps}
					/>
				</DialogClose>
			</View>
		</DialogPrimitive.Content>
	);
}
export function DialogHeader({ className, ...props }: ViewProps): React.JSX.Element {
	return (
		<View
			className={cn('pr-ctl flex flex-col gap-1.5 pl-4 text-center sm:text-left', className)}
			{...props}
		/>
	);
}
export function DialogTitle(allProps: SlottableTextProps): React.JSX.Element {
	const { className, asChild, ...props } = allProps;
	const Component = asChild ? Slot : Text;
	return (
		<TextClassContext.Provider value="text-lg text-foreground font-semibold leading-none">
			<DialogPrimitive.Title asChild>
				<Component className={className} {...props} />
			</DialogPrimitive.Title>
		</TextClassContext.Provider>
	);
}
export function DialogDescription(allProps: DialogPrimitive.DescriptionProps): React.JSX.Element {
	const { className, ...props } = allProps;
	return (
		<DialogPrimitive.Description
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	);
}
export function DialogBody({ className, ...props }: ScrollViewProps): React.JSX.Element {
	const { presentation } = useOverlay();
	return (
		<ScrollView
			horizontal={false}
			className={cn(
				'flex flex-col gap-2 px-4 py-1',
				presentation !== 'center' && 'flex-1',
				className
			)}
			{...props}
		/>
	);
}
export function DialogFooter({ className, ...props }: ViewProps): React.JSX.Element {
	const { presentation } = useOverlay();
	return (
		<View
			className={cn(
				'flex max-w-full flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end',
				presentation !== 'center' && 'border-border border-t pt-4',
				className
			)}
			{...props}
		/>
	);
}
export function DialogClose({ asChild, ...props }: DialogPrimitive.CloseProps): React.JSX.Element {
	return (
		<DialogPrimitive.Close asChild>
			{asChild ? <Slot {...props} /> : <Button variant="outline" {...props} />}
		</DialogPrimitive.Close>
	);
}
export function DialogAction(allProps: SlottablePressableProps): React.JSX.Element {
	const { asChild, disabled, ...props } = allProps;
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
