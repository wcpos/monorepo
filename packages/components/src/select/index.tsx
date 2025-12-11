import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Trigger as SelectPrimitiveTrigger, Value as SelectPrimitiveValue } from './trigger';
import { Button } from '../button';
import { Icon } from '../icon';
import { cn } from '../lib/utils';

import type { ButtonProps } from '../button';

type Option = SelectPrimitive.Option;

const Select = SelectPrimitive.Root;

const useRootContext = SelectPrimitive.useRootContext;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitiveValue;

function SelectTrigger({ className, children, ...props }: SelectPrimitive.TriggerProps) {
	return (
		<SelectPrimitiveTrigger
			className={cn(
				'web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2 text-muted-foreground border-border bg-card flex h-10 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm [&>span]:line-clamp-1',
				props.disabled && 'web:cursor-not-allowed opacity-50',
				className
			)}
			{...props}
		>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-foreground opacity-50" />
		</SelectPrimitiveTrigger>
	);
}

/**
 * Platform: WEB ONLY
 */
function SelectScrollUpButton({ className, ...props }: SelectPrimitive.ScrollUpButtonProps) {
	if (Platform.OS !== 'web') {
		return null;
	}
	return (
		<SelectPrimitive.ScrollUpButton
			className={cn('web:cursor-default flex items-center justify-center py-1', className)}
			{...props}
		>
			<Icon name="chevronUp" className="text-foreground" />
		</SelectPrimitive.ScrollUpButton>
	);
}

/**
 * Platform: WEB ONLY
 */
function SelectScrollDownButton({ className, ...props }: SelectPrimitive.ScrollDownButtonProps) {
	if (Platform.OS !== 'web') {
		return null;
	}
	return (
		<SelectPrimitive.ScrollDownButton
			className={cn('web:cursor-default flex items-center justify-center py-1', className)}
			{...props}
		>
			<Icon name="chevronDown" className="text-foreground" />
		</SelectPrimitive.ScrollDownButton>
	);
}

function SelectContent({
	className,
	children,
	position = 'popper',
	portalHost,
	...props
}: SelectPrimitive.ContentProps & { portalHost?: string }) {
	const { open } = SelectPrimitive.useRootContext();

	/**
	 * FIXME: I thought the SelectPrimitive.Content already handled mounting and unmounting via Radix presence.
	 * However, select contents are being rendered on page load, which is not what we want.
	 */
	if (!open) return null;

	return (
		<SelectPrimitive.Portal hostName={portalHost}>
			<SelectPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View
				// FIXME: There's a weird thing when the content is being unmounted, it flashes before it's removed.
				// entering={FadeIn}
				// exiting={FadeOut}
				>
					<SelectPrimitive.Content
						className={cn(
							'border-border bg-popover data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-96 min-w-32 rounded-md border px-1 py-2 shadow-md',
							position === 'popper' &&
								'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
							open
								? 'web:zoom-in-95 web:animate-in web:fade-in-0'
								: 'web:zoom-out-95 web:animate-out web:fade-out-0',
							className
						)}
						position={position}
						{...props}
					>
						{/* <SelectScrollUpButton /> */}
						<SelectPrimitive.Viewport
							className={cn(
								'p-1',
								position === 'popper' &&
									'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)'
							)}
						>
							{children}
						</SelectPrimitive.Viewport>
						{/* <SelectScrollDownButton /> */}
					</SelectPrimitive.Content>
				</Animated.View>
			</SelectPrimitive.Overlay>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({ className, ...props }: SelectPrimitive.LabelProps) {
	return (
		<SelectPrimitive.Label
			className={cn('text-popover-foreground py-1.5 pr-2 pl-8 text-sm font-semibold', className)}
			{...props}
		/>
	);
}

function SelectItem({ className, children, ...props }: SelectPrimitive.ItemProps) {
	return (
		<SelectPrimitive.Item
			className={cn(
				'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent relative flex w-full flex-row items-center rounded-sm py-1.5 pr-2 pl-8',
				props.disabled && 'web:pointer-events-none opacity-50',
				className
			)}
			{...props}
		>
			<View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<Icon name="check" className="text-popover-foreground" />
				</SelectPrimitive.ItemIndicator>
			</View>
			<SelectPrimitive.ItemText className="web:group-focus:text-accent-foreground text-popover-foreground text-sm" />
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({ className, ...props }: SelectPrimitive.SeparatorProps) {
	return (
		<SelectPrimitive.Separator className={cn('bg-muted -mx-1 my-1 h-px', className)} {...props} />
	);
}

/**
 *
 */
function SelectButton({ className, children, ...props }: ButtonProps) {
	return (
		<Button
			className={cn(
				'web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2 border-input bg-background text-muted-foreground flex h-10 flex-row items-center justify-between rounded-md border px-3 py-2 text-sm [&>span]:line-clamp-1',
				props.disabled && 'web:cursor-not-allowed opacity-50',
				className
			)}
			variant="ghost"
			{...props}
		>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-foreground opacity-50" />
		</Button>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
	type Option,
	SelectButton,
	useRootContext,
	SelectPrimitiveTrigger,
};
