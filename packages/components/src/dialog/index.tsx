import * as React from 'react';
import {
	type GestureResponderEvent,
	ScrollView,
	type ScrollViewProps,
	View,
	type ViewProps,
} from 'react-native';

import * as DialogPrimitive from '@rn-primitives/dialog';
import { useComposedRefs } from '@rn-primitives/hooks';
import { Slot } from '@rn-primitives/slot';
import { router } from 'expo-router';

import { Button } from '../button';
import { IconButton } from '../icon-button';
import { useIsPhone } from '../lib/device';
import {
	EXIT_MARK,
	isWeb,
	OVERLAY_EXIT_MOUNTED,
	OVERLAY_MOTION,
	OverlayShell,
	useOverlay,
	useOverlayPresentation,
	useSheetInset,
} from '../lib/overlay';
import { usePortalContainer } from '../lib/portal-container';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';
import { TEXT_LADDER } from '../text/ladder';
import { isToastTarget } from '../toast/target';
import { useDialogLabels } from './labels';

import type { ButtonRef } from '../button';
import type { IconName } from '../icon';
import type { OverlayPresentation } from '../lib/overlay';
import type { SlottableTextProps } from '@rn-primitives/types';
export { DialogLabelsProvider, type DialogLabels } from './labels';

export type DialogSide = 'center' | 'left' | 'right' | 'bottom';
export type DialogSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
export type DialogProps = DialogPrimitive.RootProps & { route?: boolean; onClose?: () => void };
export type DialogContentProps = Omit<DialogPrimitive.ContentProps, 'children' | 'asChild'> & {
	ref?: React.Ref<DialogPrimitive.ContentRef>;
	side?: DialogSide;
	size?: DialogSize;
	portalHost?: string;
	inline?: boolean;
	closeLabel?: string;
	// `closeLabel` names the close control, so its props never carry a second name.
	closeButtonProps?: Omit<React.ComponentProps<typeof IconButton>, 'name' | 'accessibilityLabel'>;
	children: React.ReactNode;
};
type DialogPresentation = Exclude<OverlayPresentation, 'anchored'>;
const RouteContext = React.createContext({ route: false });
const byPresentation: Record<DialogPresentation, string> = {
	center: 'rounded-lg border',
	left: 'h-full rounded-none border-r',
	right: 'h-full rounded-none border-l',
	page: 'h-full w-full rounded-none border-0',
	// The cap sits on the wrappers and the panel fills them: on web the Radix wrapper
	// (SCRIM_WRAPPER.bottom), on native the shell's keyboard wrapper.
	bottom: 'w-full max-h-full rounded-t-2xl border-t',
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
	const { route = false, onClose, children, asChild, ...props } = allProps;
	return (
		<RouteContext.Provider value={{ route }}>
			<DialogPrimitive.Root
				{...props}
				asChild={
					asChild ?? (React.Children.count(children) === 1 && React.isValidElement(children))
				}
				{...(route
					? {
							open: true,
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
	return { open, close: React.useCallback(() => onOpenChange(false), [onOpenChange]) };
}
export function DialogContent(allProps: DialogContentProps): React.JSX.Element | null {
	const { side = 'center', portalHost, inline, testID, ...props } = allProps;
	const phone = useIsPhone();
	const presentation: DialogPresentation =
		phone && (side === 'left' || side === 'right') ? 'page' : side;
	const { route } = React.useContext(RouteContext);
	const renderInline = route || (inline ?? false);
	const { open } = DialogPrimitive.useRootContext();
	const container = usePortalContainer(portalHost);
	if (!open && !route && !OVERLAY_EXIT_MOUNTED) return null;
	const shell = (
		<OverlayShell
			Scrim={DialogPrimitive.Overlay}
			presentation={presentation}
			open={open}
			pinned={route}
			fill={props.size === 'full' && presentation === 'center'}
			testID={testID}
		>
			<DialogPanel testID={testID} {...props} />
		</OverlayShell>
	);
	return renderInline ? (
		shell
	) : (
		<DialogPrimitive.Portal hostName={portalHost} container={container}>
			{shell}
		</DialogPrimitive.Portal>
	);
}
function DialogPanel(allProps: DialogContentProps) {
	const labels = useDialogLabels();
	const { size = 'md', className, children, ...rest } = allProps;
	const {
		closeLabel,
		closeButtonProps,
		onOpenAutoFocus,
		onInteractOutside,
		testID,
		ref,
		style,
		...props
	} = rest;
	const {
		className: closeButtonClassName,
		iconClassName: closeIconClassName,
		testID: closeButtonTestID,
		...closeProps
	} = closeButtonProps ?? {};
	const { presentation, deferAutoFocus, onPanelNode, fill } = useOverlay();
	const composedRef = useComposedRefs(
		ref,
		onPanelNode as unknown as React.Ref<DialogPrimitive.ContentRef>
	);
	const { open } = DialogPrimitive.useRootContext();
	// The bottom sheet paints its own inset; 16 keeps the `py-4` the class gives.
	const inset = useSheetInset(16);
	const sizeClass =
		presentation === 'center' || presentation === 'left' || presentation === 'right'
			? sizes[size]
			: undefined;
	return (
		<DialogPrimitive.Content
			ref={composedRef}
			onOpenAutoFocus={
				deferAutoFocus
					? (event) => {
							event.preventDefault();
							onOpenAutoFocus?.(event);
						}
					: onOpenAutoFocus
			}
			onInteractOutside={(event) => {
				// A toast sits outside every dialog, yet its action can belong to one (the register
				// panel's Undo): pressing it must not dismiss the dialog underneath (#2284).
				if (isToastTarget(event.target)) event.preventDefault();
				onInteractOutside?.(event);
			}}
			className={cn(
				'bg-card border-border web:cursor-default z-60 max-h-full max-w-full gap-4 py-4',
				byPresentation[presentation as DialogPresentation],
				sizeClass,
				fill && 'h-full rounded-none border-0 py-2',
				open ? OVERLAY_MOTION[presentation].enter : OVERLAY_MOTION[presentation].exit,
				className
			)}
			testID={testID}
			// A caller's style adds to the inset; it never replaces it.
			style={[inset, style]}
			{...EXIT_MARK}
			{...props}
		>
			{children}
			<View className={cn('absolute right-1', fill ? 'top-0' : 'top-1')}>
				<DialogPrimitive.Close asChild>
					<IconButton
						name="close"
						className={cn('h-ctl w-ctl items-center justify-center', closeButtonClassName)}
						iconClassName={cn('size-4.5', closeIconClassName)}
						testID={closeButtonTestID ?? (testID ? `${testID}-close` : 'dialog-close')}
						{...closeProps}
						// After the spread: the type omits it, but a runtime object could still carry one.
						accessibilityLabel={closeLabel ?? labels.close}
					/>
				</DialogPrimitive.Close>
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
// The title is the ladder's dialog rank (16 semibold).
const DIALOG_TITLE_TEXT = `${TEXT_LADDER.dialog} text-foreground leading-none`;
export function DialogTitle(allProps: SlottableTextProps): React.JSX.Element {
	const { className, asChild, ...props } = allProps;
	const Component = asChild ? Slot : Text;
	// The dialog's own heading: level 1 inside the modal, so a SectionHeading (level 2) in its body
	// has something above it. On web the Radix Title is slotted onto this Text, so the role is ours.
	const title = <Component role="heading" aria-level={1} className={className} {...props} />;
	return (
		<TextClassContext.Provider value={DIALOG_TITLE_TEXT}>
			{/* On web the panel is a Radix dialog; slotting the title gives it aria-labelledby.
			    The native primitive ignores asChild and would nest the child in its own Text. */}
			{isWeb ? <DialogPrimitive.Title asChild>{title}</DialogPrimitive.Title> : title}
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
export type FooterButton = {
	label: string;
	onPress?: (event: GestureResponderEvent) => void;
	testID?: string;
	loading?: boolean;
	disabled?: boolean;
	/** Drawn as the Button's `leftIcon`. */
	icon?: IconName;
	accessibilityLabel?: string;
	/** The rendered Button, for a caller that must return focus to it (a dialog it opened closing). */
	ref?: React.Ref<ButtonRef>;
};
/** A slot entry; `false`/`null` is skipped, so a conditional button needs no array juggling. */
export type FooterSlot = FooterButton | false | null | undefined;
const isButton = (entry: FooterSlot): entry is FooterButton => !!entry;
export type DialogFooterProps = {
	/** The one primary: creating, moving money, sending, or a status intent. */
	intent?: FooterButton | false | null;
	/** Reversible alternatives beside the intent. */
	secondary?: FooterSlot | FooterSlot[];
	/** The record's own non-losing actions, never primary. */
	record?: FooterSlot | FooterSlot[];
	/** What loses something, outlined and apart from the intent. */
	destructive?: FooterSlot | FooterSlot[];
	/** The footer chooses Cancel with an intent, Close otherwise, from DialogLabels. */
	close?: boolean | Pick<FooterButton, 'testID' | 'onPress' | 'disabled'>;
	/** Non-button content leading the footer. Never a Button. */
	aside?: React.ReactNode;
	/** Register sheets' sale height; applies to every button. */
	size?: 'default' | 'lg';
	testID?: string;
};
export function DialogFooter({
	intent,
	secondary,
	record,
	destructive,
	close,
	aside,
	size = 'default',
	testID,
}: DialogFooterProps): React.JSX.Element {
	// Outside a shell (a Reports panel's phone page) the footer is a page's: ruled above.
	const presentation = useOverlayPresentation();
	const phone = useIsPhone();
	const labels = useDialogLabels();
	const alternatives = [secondary ?? []].flat().filter(isButton);
	const records = [record ?? []].flat().filter(isButton);
	const losses = [destructive ?? []].flat().filter(isButton);
	const count =
		alternatives.length + records.length + losses.length + Number(!!intent) + Number(!!close);
	const fill = size === 'lg' && count === 1;
	const buttonClass = cn(phone && 'w-full', fill && 'flex-1');
	const buttons = (items: FooterButton[], variant: 'default' | 'outline' | 'outline-destructive') =>
		items.map(({ label, icon, ...button }) => (
			<Button
				key={button.testID ?? label}
				{...button}
				leftIcon={icon}
				variant={variant}
				size={size}
				className={buttonClass}
			>
				{label}
			</Button>
		));
	const dismiss = close ? (
		<DialogPrimitive.Close asChild>
			<Button
				{...(typeof close === 'object' ? close : {})}
				variant="outline"
				size={size}
				className={buttonClass}
			>
				{intent ? labels.cancel : labels.close}
			</Button>
		</DialogPrimitive.Close>
	) : null;
	const primary = buttons(intent ? [intent] : [], 'default');
	const other = buttons(alternatives, 'outline');
	const own = buttons(records, 'outline');
	const losing = buttons(losses, 'outline-destructive');
	const left = (aside != null && aside !== false) || losses.length > 0 || records.length > 0;
	const group = 'min-w-0 shrink flex-row flex-wrap gap-2';
	return (
		<View
			testID={testID}
			className={cn(
				'flex max-w-full gap-2 px-4',
				presentation !== 'center' && 'border-border border-t pt-4',
				phone ? 'flex-col' : 'flex-row flex-wrap items-center',
				!phone && (left ? 'justify-between' : 'justify-end')
			)}
		>
			{phone ? (
				<>
					{primary}
					{other}
					{dismiss}
					{own}
					{losing}
					{aside}
				</>
			) : (
				<>
					{left && (
						<View className={group}>
							{aside}
							{losing}
							{own}
						</View>
					)}
					{(close || alternatives.length > 0 || intent) && (
						<View className={cn(group, fill && 'flex-1')}>
							{dismiss}
							{other}
							{primary}
						</View>
					)}
				</>
			)}
		</View>
	);
}
