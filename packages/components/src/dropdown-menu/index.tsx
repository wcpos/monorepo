import * as React from 'react';
import { Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';

import { DropdownMenuItem } from './item';
import { SHEET_LABEL_TEXT, SHEET_ROW_ROLES, SheetContext, useMenuSheet } from './sheet-context';
import { useIsPhone } from '../lib/device';
import { Icon } from '../icon';
import {
	OVERLAY_MOTION,
	OVERLAY_PANEL,
	type OverlayScrimProps,
	OverlaySheetPanel,
	OverlayShell,
} from '../lib/overlay';
import { cn } from '../lib/utils';
import { TextClassContext, Text as ThemedText } from '../text';

import type { TextProps } from '../text';

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

function DropdownMenuSub(props: DropdownMenuPrimitive.SubProps) {
	return useMenuSheet() ? <>{props.children}</> : <DropdownMenuPrimitive.Sub {...props} />;
}

const RadioSheetContext = React.createContext<DropdownMenuPrimitive.RadioGroupProps | null>(null);
function DropdownMenuRadioGroup(props: DropdownMenuPrimitive.RadioGroupProps) {
	const sheet = useMenuSheet();
	if (!sheet) return <DropdownMenuPrimitive.RadioGroup {...props} />;
	// The sheet's rows read the value from context; the container is a plain View.
	const { value: _value, onValueChange: _onValueChange, ...rest } = props;
	return (
		<RadioSheetContext.Provider value={props}>
			<View {...rest} />
		</RadioSheetContext.Provider>
	);
}

const useRootContext = DropdownMenuPrimitive.useRootContext;

// The scrim must keep one component identity across renders (on web it wraps the menu, so a
// new type remounts it and replays the entrance); the caller's overlay props reach it here.
const OverlayPropsContext = React.createContext<{
	className?: string;
	style?: StyleProp<ViewStyle>;
}>({});
function MenuScrim(p: OverlayScrimProps) {
	const overlay = React.useContext(OverlayPropsContext);
	return (
		<DropdownMenuPrimitive.Overlay
			{...p}
			className={cn(overlay.className, p.className)}
			style={[p.style, overlay.style]}
		/>
	);
}

/** Text-only children (a string, a number, an interpolation's array of them) need a Text. */
function isTextChildren(children: React.ReactNode): boolean {
	const parts = Array.isArray(children) ? children : [children];
	return parts.every((part) => typeof part === 'string' || typeof part === 'number');
}

function DropdownMenuSubTrigger(props: React.ComponentProps<typeof AnchoredSubTrigger>) {
	return useMenuSheet() ? (
		<DropdownMenuLabel inset={props.inset} testID={props.testID} className={props.className}>
			{isTextChildren(props.children) ? (
				props.children
			) : (
				<View className="flex-row items-center gap-2">{props.children}</View>
			)}
		</DropdownMenuLabel>
	) : (
		<AnchoredSubTrigger {...props} />
	);
}
function AnchoredSubTrigger({
	className,
	inset,
	children,
	...props
}: Omit<DropdownMenuPrimitive.SubTriggerProps, 'children'> & {
	inset?: boolean;
	children?: React.ReactNode;
}) {
	const { open } = DropdownMenuPrimitive.useSubContext();
	return (
		<TextClassContext.Provider value={cn('text-foreground text-base select-none')}>
			<DropdownMenuPrimitive.SubTrigger
				className={cn(
					'web:outline-none web:cursor-default web:focus:bg-muted web:hover:bg-muted active:bg-muted min-h-row relative flex flex-row items-center gap-2 rounded-md px-2.5 py-1.5',
					open && 'bg-muted',
					inset && 'pl-8',
					className
				)}
				{...props}
			>
				<>
					<View className="flex-row items-center gap-2">{children}</View>
					<Icon name="chevronRight" />
				</>
			</DropdownMenuPrimitive.SubTrigger>
		</TextClassContext.Provider>
	);
}

function DropdownMenuSubContent(props: DropdownMenuPrimitive.SubContentProps) {
	return useMenuSheet() ? (
		<View className={props.className} testID={props.testID}>
			{props.children as React.ReactNode}
		</View>
	) : (
		<AnchoredSubContent {...props} />
	);
}
function AnchoredSubContent({ className, ...props }: DropdownMenuPrimitive.SubContentProps) {
	const { open } = DropdownMenuPrimitive.useSubContext();
	return (
		<DropdownMenuPrimitive.SubContent
			className={cn(
				OVERLAY_PANEL.anchored,
				'z-50 mt-1 min-w-50 overflow-hidden p-1.5',
				open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
				className
			)}
			{...props}
		/>
	);
}

function DropdownMenuContent({
	className,
	overlayClassName,
	overlayStyle,
	portalHost,
	inline,
	...props
}: DropdownMenuPrimitive.ContentProps & {
	overlayStyle?: StyleProp<ViewStyle>;
	overlayClassName?: string;
	portalHost?: string;
	inline?: boolean;
}) {
	const { open, onOpenChange } = DropdownMenuPrimitive.useRootContext();
	const phone = useIsPhone();
	const overlay = React.useMemo(
		() => ({ className: overlayClassName, style: overlayStyle }),
		[overlayClassName, overlayStyle]
	);
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayPropsContext.Provider value={overlay}>
			<OverlayShell
				presentation={phone ? 'bottom' : 'anchored'}
				open={open}
				Scrim={MenuScrim}
				testID={props.testID}
				onDismiss={phone ? () => onOpenChange(false) : undefined}
			>
				{phone ? (
					<SheetContext.Provider value={{ close: () => onOpenChange(false) }}>
						<OverlaySheetPanel testID={props.testID} className={className} style={props.style}>
							{/* A long menu (the user menu's stores) scrolls inside the bounded panel; the rows
							    sit in a menu container, eight points apart (the design rule's target gap). */}
							<ScrollView>
								<View role="menu" className="gap-2">
									{props.children as React.ReactNode}
								</View>
							</ScrollView>
						</OverlaySheetPanel>
					</SheetContext.Provider>
				) : (
					<DropdownMenuPrimitive.Content
						className={cn(
							OVERLAY_PANEL.anchored,
							'z-50 min-w-50 overflow-hidden p-1.5',
							open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
							className
						)}
						{...props}
					/>
				)}
			</OverlayShell>
		</OverlayPropsContext.Provider>
	);
	return inline ? (
		phone && !open ? null : (
			shell
		)
	) : (
		<DropdownMenuPrimitive.Portal hostName={portalHost}>{shell}</DropdownMenuPrimitive.Portal>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	...props
}: DropdownMenuPrimitive.CheckboxItemProps) {
	const sheet = useMenuSheet();
	if (sheet)
		return (
			<Pressable
				role={SHEET_ROW_ROLES.checkbox}
				aria-checked={checked}
				disabled={props.disabled}
				testID={props.testID}
				className={cn(
					'active:bg-muted min-h-row w-full flex-row items-center gap-2 rounded-md px-2 py-1.5',
					props.disabled && 'web:pointer-events-none opacity-45',
					className
				)}
				onPress={(e) => {
					props.onPress?.(e);
					props.onCheckedChange?.(!checked);
					if (props.closeOnPress !== false) sheet.close();
				}}
			>
				{/* The row is the control: a presentational mark in the checkbox's skin, not a
				    second focusable Checkbox inside a menu item (CodeRabbit, #2215). */}
				<View
					aria-hidden
					className={cn(
						'border-border bg-card size-5 items-center justify-center rounded-sm border',
						checked && 'bg-primary border-primary'
					)}
				>
					{checked && <Icon name="check" className="text-primary-foreground size-3" />}
				</View>
				<>{children}</>
			</Pressable>
		);
	return (
		<DropdownMenuPrimitive.CheckboxItem
			className={cn(
				'web:outline-none web:cursor-default web:focus:bg-muted web:hover:bg-muted active:bg-muted min-h-row relative flex flex-row items-center gap-2 rounded-md py-1.5 pr-2 pl-8',
				props.disabled && 'web:pointer-events-none opacity-45',
				className
			)}
			checked={checked}
			{...props}
		>
			<View className="absolute left-2 flex size-4 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Icon name="check" className="text-primary" />
				</DropdownMenuPrimitive.ItemIndicator>
			</View>
			<>{children}</>
		</DropdownMenuPrimitive.CheckboxItem>
	);
}

function DropdownMenuRadioItem({
	className,
	children,
	...props
}: DropdownMenuPrimitive.RadioItemProps) {
	const sheet = useMenuSheet();
	const radio = React.useContext(RadioSheetContext);
	if (sheet)
		return (
			<Pressable
				role={SHEET_ROW_ROLES.radio}
				aria-checked={radio?.value === props.value}
				disabled={props.disabled}
				testID={props.testID}
				className={cn(
					'active:bg-muted min-h-row w-full flex-row items-center gap-2 rounded-md px-2 py-1.5',
					props.disabled && 'web:pointer-events-none opacity-45',
					className
				)}
				onPress={(e) => {
					props.onPress?.(e);
					radio?.onValueChange(props.value);
					if (props.closeOnPress !== false) sheet.close();
				}}
			>
				<View className="size-4 items-center justify-center">
					{radio?.value === props.value && <View className="bg-primary h-2 w-2 rounded-full" />}
				</View>
				<>{children}</>
			</Pressable>
		);
	return (
		<DropdownMenuPrimitive.RadioItem
			className={cn(
				'web:outline-none web:cursor-default web:focus:bg-muted web:hover:bg-muted active:bg-muted min-h-row relative flex flex-row items-center gap-2 rounded-md py-1.5 pr-2 pl-8',
				props.disabled && 'web:pointer-events-none opacity-45',
				className
			)}
			{...props}
		>
			<View className="absolute left-2 flex size-4 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<View className="bg-primary h-2 w-2 rounded-full" />
				</DropdownMenuPrimitive.ItemIndicator>
			</View>
			<>{children}</>
		</DropdownMenuPrimitive.RadioItem>
	);
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: DropdownMenuPrimitive.LabelProps & { inset?: boolean }) {
	if (useMenuSheet())
		return (
			<View
				testID={props.testID}
				className={cn('h-9 justify-center px-2', inset && 'pl-8', className)}
			>
				{/* A composed child (an icon and a Text) reads the label style from context; RN
				    text styles do not pass through a View (CodeRabbit, #2215). */}
				<TextClassContext.Provider value={SHEET_LABEL_TEXT}>
					{isTextChildren(props.children) ? (
						<ThemedText className={SHEET_LABEL_TEXT}>{props.children}</ThemedText>
					) : (
						props.children
					)}
				</TextClassContext.Provider>
			</View>
		);
	return (
		<DropdownMenuPrimitive.Label
			className={cn(
				'text-foreground web:cursor-default px-2.5 py-1.5 text-sm font-semibold',
				inset && 'pl-8',
				className
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({ className, ...props }: DropdownMenuPrimitive.SeparatorProps) {
	if (useMenuSheet())
		return <View {...props} className={cn('bg-border -mx-2 my-1 h-px', className)} />;
	return (
		<DropdownMenuPrimitive.Separator
			className={cn('bg-border -mx-1.5 my-1 h-px', className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({ className, ...props }: TextProps) {
	return <Text className={cn('text-muted-foreground ml-auto text-sm', className)} {...props} />;
}

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	useRootContext,
	DropdownMenuItem,
};
