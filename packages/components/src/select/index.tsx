import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Trigger as SelectPrimitiveTrigger, Value as SelectPrimitiveValue } from './trigger';
import { Button } from '../button';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';

import type { ButtonProps } from '../button';

type Option = SelectPrimitive.Option;

const Select = SelectPrimitive.Root;

const useRootContext = SelectPrimitive.useRootContext;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitiveValue;

const SelectTrigger = React.forwardRef<SelectPrimitive.TriggerRef, SelectPrimitive.TriggerProps>(
	({ className, children, ...props }, ref) => {
		return (
			<SelectPrimitiveTrigger
				ref={ref}
				className={cn(
					'native:h-12',
					'web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2',
					'text-muted-foreground flex h-10 flex-row items-center justify-between gap-2 px-3 py-2 text-sm',
					'border-input bg-background rounded-md border',
					'[&>span]:line-clamp-1',
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
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/**
 * Platform: WEB ONLY
 */
const SelectScrollUpButton = ({ className, ...props }: SelectPrimitive.ScrollUpButtonProps) => {
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
};

/**
 * Platform: WEB ONLY
 */
const SelectScrollDownButton = ({ className, ...props }: SelectPrimitive.ScrollDownButtonProps) => {
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
};

const SelectContent = React.forwardRef<
	SelectPrimitive.ContentRef,
	SelectPrimitive.ContentProps & { portalHost?: string }
>(({ className, children, position = 'popper', portalHost, ...props }, ref) => {
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
						ref={ref}
						className={cn(
							'border-border bg-popover shadow-foreground/10 relative z-50 max-h-96 min-w-[8rem] rounded-md border px-1 py-2 shadow-md',
							'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
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
									'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
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
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<SelectPrimitive.LabelRef, SelectPrimitive.LabelProps>(
	({ className, ...props }, ref) => (
		<SelectPrimitive.Label
			ref={ref}
			className={cn('text-popover-foreground py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
			{...props}
		/>
	)
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<SelectPrimitive.ItemRef, SelectPrimitive.ItemProps>(
	({ className, children, ...props }, ref) => (
		<SelectPrimitive.Item
			ref={ref}
			className={cn(
				'native:py-2 native:pl-10',
				'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent',
				'relative flex w-full flex-row items-center rounded-sm py-1.5 pl-8 pr-2',
				props.disabled && 'web:pointer-events-none opacity-50',
				className
			)}
			{...props}
		>
			<View className="native:left-3.5 native:pt-px absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<Icon name="check" className="text-popover-foreground" />
				</SelectPrimitive.ItemIndicator>
			</View>
			<SelectPrimitive.ItemText className="native:text-base web:group-focus:text-accent-foreground text-popover-foreground text-sm" />
		</SelectPrimitive.Item>
	)
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
	SelectPrimitive.SeparatorRef,
	SelectPrimitive.SeparatorProps
>(({ className, ...props }, ref) => (
	<SelectPrimitive.Separator
		ref={ref}
		className={cn('bg-muted -mx-1 my-1 h-px', className)}
		{...props}
	/>
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

/**
 *
 */
const SelectButton = React.forwardRef<React.ElementRef<typeof Button>, ButtonProps>(
	({ className, children, ...props }, ref) => (
		<Button
			ref={ref}
			className={cn(
				'native:h-12 web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2',
				'border-input bg-background text-muted-foreground flex h-10 flex-row items-center justify-between rounded-md border px-3 py-2 text-sm [&>span]:line-clamp-1',
				props.disabled && 'web:cursor-not-allowed opacity-50',
				className
			)}
			variant="ghost"
			{...props}
		>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-foreground opacity-50" />
		</Button>
	)
);

SelectButton.displayName = 'SelectButton';

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
