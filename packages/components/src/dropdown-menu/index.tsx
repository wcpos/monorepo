import * as React from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';

import { DropdownMenuItem } from './item';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const useRootContext = DropdownMenuPrimitive.useRootContext;

const DropdownMenuSubTrigger = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
		inset?: boolean;
	}
>(({ className, inset, children, ...props }, ref) => {
	const { open } = DropdownMenuPrimitive.useSubContext();
	// const Icon = Platform.OS === 'web' ? ChevronRight : open ? ChevronUp : ChevronDown;
	return (
		<TextClassContext.Provider
			value={cn('select-none native:text-lg', open && 'native:text-accent-foreground')}
		>
			<DropdownMenuPrimitive.SubTrigger
				ref={ref}
				className={cn(
					'flex flex-row web:cursor-default web:select-none gap-2 items-center web:focus:bg-accent web:hover:bg-accent active:bg-accent rounded-sm px-2 py-1.5 native:py-2 web:outline-none',
					open && 'bg-accent',
					inset && 'pl-8',
					className
				)}
				{...props}
			>
				<View className="flex-1 flex-row gap-2 items-center">{children}</View>
				{/* <Icon size={18} className="ml-auto text-foreground" /> */}
				<Icon name="chevronRight" />
			</DropdownMenuPrimitive.SubTrigger>
		</TextClassContext.Provider>
	);
});
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => {
	const { open } = DropdownMenuPrimitive.useSubContext();
	return (
		<DropdownMenuPrimitive.SubContent
			ref={ref}
			className={cn(
				'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border mt-1 bg-popover p-1 shadow-md shadow-foreground/5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
				open
					? 'web:animate-in web:fade-in-0 web:zoom-in-95'
					: 'web:animate-out web:fade-out-0 web:zoom-out ',
				className
			)}
			{...props}
		/>
	);
});
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
		overlayStyle?: StyleProp<ViewStyle>;
		overlayClassName?: string;
		portalHost?: string;
	}
>(({ className, overlayClassName, overlayStyle, portalHost, ...props }, ref) => {
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
					ref={ref}
					className={cn(
						'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md shadow-foreground/5 web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2',
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
});
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
	<DropdownMenuPrimitive.CheckboxItem
		ref={ref}
		className={cn(
			'relative flex flex-row web:cursor-default items-center web:group rounded-sm py-1.5 native:py-2 pl-8 pr-2 web:outline-none web:focus:bg-accent active:bg-accent',
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
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
	<DropdownMenuPrimitive.RadioItem
		ref={ref}
		className={cn(
			'relative flex flex-row web:cursor-default web:group items-center rounded-sm py-1.5 native:py-2 pl-8 pr-2 web:outline-none web:focus:bg-accent active:bg-accent',
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
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Label>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
		inset?: boolean;
	}
>(({ className, inset, ...props }, ref) => (
	<DropdownMenuPrimitive.Label
		ref={ref}
		className={cn(
			'px-2 py-1.5 text-base native:text-base font-semibold text-foreground web:cursor-default',
			inset && 'pl-8',
			className
		)}
		{...props}
	/>
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<DropdownMenuPrimitive.Separator
		ref={ref}
		className={cn('-mx-1 my-1 h-px bg-border', className)}
		{...props}
	/>
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof Text>) => {
	return (
		<Text
			className={cn(
				'ml-auto text-xs native:text-sm tracking-widest text-muted-foreground',
				className
			)}
			{...props}
		/>
	);
};
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

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