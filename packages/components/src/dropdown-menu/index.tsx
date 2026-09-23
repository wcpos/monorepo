import * as React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';

import { DropdownMenuItem } from './item';
import { Icon } from '../icon';
import {
	OVERLAY_MOTION,
	OVERLAY_PANEL,
	type OverlayScrimProps,
	OverlayShell,
} from '../lib/overlay';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { TextProps } from '../text';

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

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

function DropdownMenuSubTrigger({
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

function DropdownMenuSubContent({ className, ...props }: DropdownMenuPrimitive.SubContentProps) {
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
	const { open } = DropdownMenuPrimitive.useRootContext();
	const overlay = React.useMemo(
		() => ({ className: overlayClassName, style: overlayStyle }),
		[overlayClassName, overlayStyle]
	);
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayPropsContext.Provider value={overlay}>
			<OverlayShell presentation="anchored" open={open} Scrim={MenuScrim} testID={props.testID}>
				<DropdownMenuPrimitive.Content
					className={cn(
						OVERLAY_PANEL.anchored,
						'z-50 min-w-50 overflow-hidden p-1.5',
						open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
						className
					)}
					{...props}
				/>
			</OverlayShell>
		</OverlayPropsContext.Provider>
	);
	return inline ? (
		shell
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
