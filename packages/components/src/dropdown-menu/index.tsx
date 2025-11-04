import * as React from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';

import { DropdownMenuItem } from './item';
import { Icon } from '../icon';
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

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: DropdownMenuPrimitive.SubTriggerProps & { inset?: boolean }) {
	const { open } = DropdownMenuPrimitive.useSubContext();
	// const Icon = Platform.OS === 'web' ? ChevronRight : open ? ChevronUp : ChevronDown;
	return (
		<TextClassContext.Provider value={cn('select-none', open && 'native:text-accent-foreground')}>
			<DropdownMenuPrimitive.SubTrigger
				className={cn(
					'web:cursor-default web:select-none web:focus:bg-accent web:hover:bg-accent active:bg-accent web:outline-none',
					'flex flex-row items-center gap-2 rounded-sm px-2 py-1.5',
					open && 'bg-accent',
					inset && 'pl-8',
					className
				)}
				{...props}
			>
				<View className="flex-row items-center gap-2">{children}</View>
				<Icon name="chevronRight" />
			</DropdownMenuPrimitive.SubTrigger>
		</TextClassContext.Provider>
	);
}

function DropdownMenuSubContent({ className, ...props }: DropdownMenuPrimitive.SubContentProps) {
	const { open } = DropdownMenuPrimitive.useSubContext();
	return (
		<DropdownMenuPrimitive.SubContent
			className={cn(
				'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
				'border-border bg-popover z-50 mt-1 min-w-32 overflow-hidden rounded-md border p-1 shadow-md',
				open
					? 'web:animate-in web:fade-in-0 web:zoom-in-95'
					: 'web:animate-out web:fade-out-0 web:zoom-out',
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
	...props
}: DropdownMenuPrimitive.ContentProps & {
	overlayStyle?: StyleProp<ViewStyle>;
	overlayClassName?: string;
	portalHost?: string;
}) {
	const { open } = DropdownMenuPrimitive.useRootContext();
	return (
		<DropdownMenuPrimitive.Portal hostName={portalHost}>
			<DropdownMenuPrimitive.Overlay
				style={
					overlayStyle
						? StyleSheet.flatten([
								Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined,
								overlayStyle,
							] as ViewStyle)
						: Platform.OS !== 'web'
							? StyleSheet.absoluteFill
							: undefined
				}
				className={overlayClassName}
			>
				<DropdownMenuPrimitive.Content
					className={cn(
						'web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2',
						'border-border bg-popover z-50 min-w-32 overflow-hidden rounded-md border p-1 shadow-md',
						open
							? 'web:animate-in web:fade-in-0 web:zoom-in-95'
							: 'web:animate-out web:fade-out-0 web:zoom-out-95',
						className
					)}
					{...props}
				/>
			</DropdownMenuPrimitive.Overlay>
		</DropdownMenuPrimitive.Portal>
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
				'web:cursor-default web:group web:outline-none web:focus:bg-accent active:bg-accent',
				'relative flex flex-row items-center rounded-sm py-1.5 pl-8 pr-2',
				props.disabled && 'web:pointer-events-none opacity-50',
				className
			)}
			checked={checked}
			{...props}
		>
			<View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Icon name="check" />
					{/* <Check size={14} strokeWidth={3} className="text-foreground" /> */}
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
				'web:cursor-default web:group web:outline-none web:focus:bg-accent active:bg-accent',
				'relative flex flex-row items-center rounded-sm py-1.5 pl-8 pr-2',
				props.disabled && 'web:pointer-events-none opacity-50',
				className
			)}
			{...props}
		>
			<View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<View className="bg-foreground h-2 w-2 rounded-full" />
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
				'text-foreground web:cursor-default px-2 py-1.5 text-base font-semibold',
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
			className={cn('bg-border -mx-1 my-1 h-px', className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({ className, ...props }: TextProps) {
	return (
		<Text
			className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
			{...props}
		/>
	);
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
