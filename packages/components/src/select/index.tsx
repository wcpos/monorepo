import * as React from 'react';
import { Platform, View } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';

import { Trigger as SelectPrimitiveTrigger, Value as SelectPrimitiveValue } from './trigger';
import { toControlledSingleProps } from './controlled-value';
import { resolveOption } from './resolve-option';
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
import { OVERLAY_MOTION, OVERLAY_PANEL, OverlayShell } from '../lib/overlay';
import { webTestID } from '../lib/test-id';
import { cn } from '../lib/utils';

import type { ButtonProps } from '../button';
import type { Option, SelectRootProps, SelectSingleRootProps, SelectValueProps } from './types';

/**
 * Context to signal multi-select mode to child components.
 * In single mode this is null; children fall back to SelectPrimitive APIs.
 */
const MultiModeContext = React.createContext<boolean>(false);

const SelectWidthContext = React.createContext<number | undefined>(undefined);
const SelectLayoutContext = React.createContext<((e: any) => void) | undefined>(undefined);

function Select({ multiple, ...props }: SelectRootProps) {
	const { width: triggerWidth, onLayout } = useLayoutWidth();

	const content = multiple ? (
		<MultiModeContext.Provider value={true}>
			<SelectMultiRoot {...(props as any)} multiple />
		</MultiModeContext.Provider>
	) : (
		<MultiModeContext.Provider value={false}>
			<SelectPrimitive.Root {...(toControlledSingleProps(props) as any)} />
		</MultiModeContext.Provider>
	);

	return (
		<SelectWidthContext.Provider value={triggerWidth}>
			<SelectLayoutContext.Provider value={onLayout}>{content}</SelectLayoutContext.Provider>
		</SelectWidthContext.Provider>
	);
}

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
					'text-foreground border-border bg-card h-ctl flex flex-row items-center justify-between gap-2 rounded-lg border px-3 py-2 text-base [&>span]:line-clamp-1',
					props.disabled && 'web:cursor-not-allowed opacity-45',
					className
				)}
				onLayout={handleLayout}
				{...(props as any)}
			>
				<>{children}</>
				<Icon name="chevronDown" aria-hidden={true} className="text-muted-foreground" />
			</SelectMultiTrigger>
		);
	}

	return (
		<SelectPrimitiveTrigger
			asChild={asChild}
			className={cn(
				'text-foreground border-border bg-card h-ctl flex flex-row items-center justify-between gap-2 rounded-lg border px-3 py-2 text-base [&>span]:line-clamp-1',
				props.disabled && 'web:cursor-not-allowed opacity-45',
				className
			)}
			onLayout={handleLayout}
			{...props}
		>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-muted-foreground" />
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
	inline,
	...props
}: SelectPrimitive.ContentProps & { portalHost?: string; matchWidth?: boolean; inline?: boolean }) {
	const { open } = SelectPrimitive.useRootContext();
	const triggerWidth = React.useContext(SelectWidthContext);

	if (!open) return null;

	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayShell
			presentation="anchored"
			open={open}
			Scrim={SelectPrimitive.Overlay}
			testID={props.testID}
		>
			<SelectPrimitive.Content
				className={cn(
					OVERLAY_PANEL.anchored,
					'relative z-50 max-h-96 min-w-32 p-1.5',
					position === 'popper' &&
						'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
					open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
					className
				)}
				style={matchWidth && triggerWidth ? { width: triggerWidth } : undefined}
				position={position}
				{...props}
			>
				<SelectPrimitive.Viewport
					className={cn(
						'p-0',
						position === 'popper' &&
							'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)'
					)}
				>
					{children}
				</SelectPrimitive.Viewport>
			</SelectPrimitive.Content>
		</OverlayShell>
	);
	return inline ? (
		shell
	) : (
		<SelectPrimitive.Portal hostName={portalHost}>{shell}</SelectPrimitive.Portal>
	);
}

function SelectContent({
	matchWidth,
	...props
}: SelectPrimitive.ContentProps & { portalHost?: string; matchWidth?: boolean; inline?: boolean }) {
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
			className={cn('text-foreground py-1.5 pr-2 pl-8 text-sm font-semibold', className)}
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
				'web:cursor-default web:select-none web:hover:bg-muted web:outline-none web:focus:bg-muted active:bg-muted min-h-row relative flex w-full flex-row items-center rounded-md py-1.5 pr-2 pl-8',
				props.disabled && 'web:pointer-events-none opacity-45',
				className
			)}
			{...props}
			{...webTestID(props.testID)}
		>
			<View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<Icon name="check" className="text-primary" />
				</SelectPrimitive.ItemIndicator>
			</View>
			<SelectPrimitive.ItemText className="text-foreground text-base" />
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({ className, ...props }: SelectPrimitive.SeparatorProps) {
	return (
		<SelectPrimitive.Separator
			className={cn('bg-border -mx-1.5 my-1 h-px', className)}
			{...props}
		/>
	);
}

function SelectButton({ className, children, ...props }: ButtonProps) {
	return (
		<Button
			className={cn(
				'text-foreground border-border bg-card h-ctl flex flex-row items-center justify-between gap-2 rounded-lg border px-3 py-2 text-base [&>span]:line-clamp-1',
				props.disabled && 'web:cursor-not-allowed opacity-45',
				className
			)}
			variant="ghost"
			{...props}
		>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-muted-foreground" />
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

type OptionSelectOption = Option & { disabled?: boolean };

type OptionSelectProps = Omit<SelectSingleRootProps, 'children' | 'onValueChange' | 'value'> & {
	options: OptionSelectOption[];
	value?: string;
	onChange?: (value: string | undefined, option: Option | undefined) => void;
	placeholder: string;
	fallbackLabel?: string;
	matchWidth?: boolean;
	triggerClassName?: string;
	valueClassName?: string;
};

function OptionSelect({
	options,
	value,
	onChange,
	placeholder,
	fallbackLabel,
	matchWidth,
	triggerClassName,
	valueClassName,
	...props
}: OptionSelectProps) {
	const selected = options.find((option) => option.value === value);
	const selectedValue =
		value !== undefined && (selected || fallbackLabel !== undefined)
			? { value, label: selected?.label ?? fallbackLabel ?? '' }
			: undefined;

	return (
		<Select
			value={selectedValue}
			onValueChange={(option) => onChange?.(option?.value, resolveOption(options, option))}
			{...props}
		>
			<SelectTrigger className={triggerClassName}>
				<SelectValue className={valueClassName} placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent matchWidth={matchWidth}>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem
							key={option.value}
							value={option.value}
							label={option.label}
							disabled={option.disabled}
						/>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

export {
	OptionSelect,
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

export type { OptionSelectOption, OptionSelectProps };
