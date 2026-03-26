import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';
import Animated from 'react-native-reanimated';

import { Trigger as SelectPrimitiveTrigger, Value as SelectPrimitiveValue } from './trigger';
import {
	SelectMultiContent,
	SelectMultiItem,
	SelectMultiRoot,
	SelectMultiTrigger,
	SelectMultiValue,
} from './select-multi';
import { Button } from '../button';
import { Icon } from '../icon';
import { useLayoutWidth } from '../lib/use-layout-width';
import { cn } from '../lib/utils';

import type { ButtonProps } from '../button';
import type { Option, SelectRootProps, SelectValueProps } from './types';

/**
 * Context to signal multi-select mode to child components.
 * In single mode this is null; children fall back to SelectPrimitive APIs.
 */
const MultiModeContext = React.createContext<boolean>(false);

const SelectWidthContext = React.createContext<number | undefined>(undefined);

function Select({ multiple, ...props }: SelectRootProps) {
	const { width: triggerWidth, onLayout } = useLayoutWidth();

	const content = multiple ? (
		<MultiModeContext.Provider value={true}>
			<SelectMultiRoot {...(props as any)} multiple />
		</MultiModeContext.Provider>
	) : (
		<MultiModeContext.Provider value={false}>
			<SelectPrimitive.Root {...(props as any)} />
		</MultiModeContext.Provider>
	);

	return (
		<SelectWidthContext.Provider value={triggerWidth}>
			<SelectLayoutContext.Provider value={onLayout}>{content}</SelectLayoutContext.Provider>
		</SelectWidthContext.Provider>
	);
}

const SelectLayoutContext = React.createContext<((e: any) => void) | undefined>(undefined);

const useRootContext = SelectPrimitive.useRootContext;

const SelectGroup = SelectPrimitive.Group;

function SelectValue({
	placeholder,
	asChild,
	className,
	maxDisplayLength,
	truncationStyle,
	...props
}: SelectValueProps) {
	const isMulti = React.useContext(MultiModeContext);

	if (isMulti) {
		return (
			<SelectMultiValue
				placeholder={placeholder}
				asChild={asChild}
				className={className}
				maxDisplayLength={maxDisplayLength}
				truncationStyle={truncationStyle}
				{...props}
			/>
		);
	}

	return (
		<SelectPrimitiveValue
			placeholder={placeholder}
			asChild={asChild}
			className={className}
			{...props}
		/>
	);
}

function SelectTrigger({
	className,
	children,
	asChild,
	onLayout: onLayoutProp,
	...props
}: SelectPrimitive.TriggerProps) {
	const isMulti = React.useContext(MultiModeContext);
	const layoutHandler = React.useContext(SelectLayoutContext);

	const handleLayout = React.useCallback(
		(e: import('react-native').LayoutChangeEvent) => {
			layoutHandler?.(e);
			onLayoutProp?.(e);
		},
		[layoutHandler, onLayoutProp]
	);

	if (isMulti) {
		if (asChild) {
			return (
				<SelectMultiTrigger
					asChild
					className={className}
					onLayout={handleLayout}
					{...(props as any)}
				>
					{children}
				</SelectMultiTrigger>
			);
		}
		return (
			<SelectMultiTrigger
				className={cn(
					'web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2 text-muted-foreground border-border bg-card flex h-10 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm [&>span]:line-clamp-1',
					props.disabled && 'web:cursor-not-allowed opacity-50',
					className
				)}
				onLayout={handleLayout}
				{...(props as any)}
			>
				<>{children}</>
				<Icon name="chevronDown" aria-hidden={true} className="text-foreground opacity-50" />
			</SelectMultiTrigger>
		);
	}

	return (
		<SelectPrimitiveTrigger
			asChild={asChild}
			className={cn(
				'web:ring-offset-background web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2 text-muted-foreground border-border bg-card flex h-10 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm [&>span]:line-clamp-1',
				props.disabled && 'web:cursor-not-allowed opacity-50',
				className
			)}
			onLayout={handleLayout}
			{...props}
		>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-foreground opacity-50" />
		</SelectPrimitiveTrigger>
	);
}

/**
 * Internal single-select content component that safely calls useRootContext at top level.
 */
function SelectSingleContent({
	className,
	children,
	position = 'popper',
	portalHost,
	matchWidth,
	...props
}: SelectPrimitive.ContentProps & { portalHost?: string; matchWidth?: boolean }) {
	const { open } = SelectPrimitive.useRootContext();
	const triggerWidth = React.useContext(SelectWidthContext);

	if (!open) return null;

	return (
		<SelectPrimitive.Portal hostName={portalHost}>
			<SelectPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View>
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
						style={matchWidth && triggerWidth ? { width: triggerWidth } : undefined}
						position={position}
						{...props}
					>
						<SelectPrimitive.Viewport
							className={cn(
								'p-1',
								position === 'popper' &&
									'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)'
							)}
						>
							{children}
						</SelectPrimitive.Viewport>
					</SelectPrimitive.Content>
				</Animated.View>
			</SelectPrimitive.Overlay>
		</SelectPrimitive.Portal>
	);
}

function SelectContent({
	matchWidth,
	...props
}: SelectPrimitive.ContentProps & { portalHost?: string; matchWidth?: boolean }) {
	const isMulti = React.useContext(MultiModeContext);
	const triggerWidth = React.useContext(SelectWidthContext);

	if (isMulti) {
		const { className, children, portalHost, ...rest } = props;
		return (
			<SelectMultiContent
				className={className}
				portalHost={portalHost}
				style={matchWidth && triggerWidth ? { width: triggerWidth } : undefined}
				{...(rest as any)}
			>
				{children}
			</SelectMultiContent>
		);
	}

	return <SelectSingleContent matchWidth={matchWidth} {...props} />;
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
	const isMulti = React.useContext(MultiModeContext);

	if (isMulti) {
		return (
			<SelectMultiItem
				value={props.value}
				label={props.label}
				disabled={props.disabled ?? undefined}
				className={className}
			>
				{children as React.ReactNode}
			</SelectMultiItem>
		);
	}

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

export type {
	SelectRootProps,
	SelectSingleRootProps,
	SelectMultiRootProps,
	SelectValueProps,
} from './types';
