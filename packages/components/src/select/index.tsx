import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import * as SelectPrimitive from '@rn-primitives/select';

import { Trigger as SelectPrimitiveTrigger } from './trigger';
import { Value as SelectPrimitiveValue } from './value';
import { toControlledSingleProps } from './controlled-value';
import { resolveOption } from './resolve-option';
import {
	SelectMultiContent,
	SelectMultiItem,
	SelectMultiRoot,
	SelectMultiTrigger,
	SelectMultiValue,
} from './select-multi';
import { fieldBox } from '../field-box';
import { Icon } from '../icon';
import { useLayoutWidth } from './use-layout-width';
import {
	AnchoredOverlay,
	type OverlayAnchor,
	type OverlayScrimProps,
	useOverlayPresentation,
} from '../lib/overlay';
import { MenuRow } from '../menu-row';
import { Text } from '../text';
import { webTestID } from './test-id';
import { cn } from '../lib/utils';

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

/** On the phone sheet no primitive Content is mounted: the parts draw plain Views. */
const useSheet = () => useOverlayPresentation() === 'bottom';
function SelectGroup(props: SelectPrimitive.GroupProps) {
	if (useSheet()) return <View {...props} role="group" />;
	return <SelectPrimitive.Group {...props} />;
}

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

/** The closed face's layout inside the field box: the value, then the chevron at the end. */
const SELECT_FACE = 'flex-row items-center justify-between gap-2 px-3 py-2 [&>span]:line-clamp-1';

function SelectTrigger({
	className,
	children,
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

	const Trigger = isMulti ? SelectMultiTrigger : SingleSelectTrigger;
	return (
		<Trigger className={cn(SELECT_FACE, className)} onLayout={handleLayout} {...(props as any)}>
			<>{children}</>
			<Icon name="chevronDown" aria-hidden={true} className="text-muted-foreground" />
		</Trigger>
	);
}

/** The single select's field box, lit while its list is open. */
function SingleSelectTrigger({ className, ...props }: SelectPrimitive.TriggerProps) {
	const { open } = SelectPrimitive.useRootContext();
	const state = props.disabled ? 'disabled' : open ? 'open' : 'rest';
	return <SelectPrimitiveTrigger className={cn(fieldBox({ state }), className)} {...props} />;
}

/**
 * Internal single-select content component that safely calls useRootContext at top level.
 */
function SelectSingleContent({
	position = 'popper',
	matchWidth,
	...props
}: SelectPrimitive.ContentProps & { portalHost?: string; matchWidth?: boolean; inline?: boolean }) {
	const { open, onOpenChange } = SelectPrimitive.useRootContext();
	const triggerWidth = React.useContext(SelectWidthContext);

	if (!open) return null;
	return (
		<AnchoredOverlay
			anchor={SELECT}
			open={open}
			onOpenChange={onOpenChange}
			size={cn(
				'relative max-h-96 min-w-32 p-1.5',
				// The trigger-width floor sits on the bordered, padded box, not the viewport: there it
				// made trigger-width rows inside a trigger-width box, overflowing its padding and border.
				position === 'popper' && 'min-w-(--radix-select-trigger-width)',
				position === 'popper' &&
					'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1'
			)}
			// Options in a group: a listbox promises arrow keys a touch sheet lacks (CodeRabbit, #2215).
			list="group"
			content={{
				style: matchWidth && triggerWidth ? { width: triggerWidth } : undefined,
				position,
				...props,
			}}
			sheetStyle={props.style}
		/>
	);
}

/** The anchored adapter: Radix's positioned list, with the rows inside its viewport. */
function SelectPanel({ position, children, ...props }: SelectPrimitive.ContentProps) {
	return (
		<SelectPrimitive.Content position={position} {...props}>
			<SelectPrimitive.Viewport
				className={cn('p-0', position === 'popper' && 'h-(--radix-select-trigger-height) w-full')}
			>
				{children}
			</SelectPrimitive.Viewport>
		</SelectPrimitive.Content>
	);
}

/**
 * The primitive's WEB Overlay renders its Pressable with no children and emits `children`
 * as a sibling (Radix positions the anchored content itself), so the phone sheet fell out
 * of the scrim's `justify-end` box and rendered after the app root: a dimmed screen with the
 * sheet below the fold, on every single select at phone width on web. The scrim here is the
 * plain Pressable the primitive would render, with its children kept inside it; native keeps
 * the primitive's Overlay (the shell renders that scrim childless by design).
 */
function SelectScrim(p: OverlayScrimProps) {
	return Platform.OS === 'web' ? <Pressable {...p} /> : <SelectPrimitive.Overlay {...p} />;
}
const SELECT: OverlayAnchor = {
	Portal: SelectPrimitive.Portal,
	Scrim: SelectScrim,
	Content: SelectPanel,
};

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
	if (useSheet())
		return (
			<View testID={props.testID} className={cn('h-9 justify-center px-2', className)}>
				<Text variant="caption">{props.children}</Text>
			</View>
		);
	return (
		<SelectPrimitive.Label
			className={cn('text-foreground py-1.5 pr-2 pl-8 text-sm font-semibold', className)}
			{...props}
		/>
	);
}

function SelectItem({ className, children, ...props }: SelectPrimitive.ItemProps) {
	const sheet = useSheet();
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

	if (sheet)
		return (
			<SelectSheetItem className={className} {...props}>
				{children}
			</SelectSheetItem>
		);
	return <SelectAnchoredItem className={className} {...props} />;
}

/** Native presses the row through `asChild`; web's Radix option hosts it (a nested pressable swallows its click). */
function SelectAnchoredItem({ className, ...props }: SelectPrimitive.ItemProps) {
	const { value } = SelectPrimitive.useRootContext();
	// On web the Radix item is a DOM node: `testID` must not reach it (React warns on the
	// unknown attribute), `data-testid` carries the id instead. Native keeps `testID`.
	const { testID, ...item } = props;
	return (
		<SelectPrimitive.Item
			asChild={Platform.OS !== 'web'}
			className="web:outline-none web:focus:bg-muted rounded-md"
			{...item}
			{...(Platform.OS === 'web' ? webTestID(testID) : { testID })}
		>
			<MenuRow
				hosted={Platform.OS === 'web'}
				role="option"
				choice
				selected={value?.value === props.value}
				disabled={!!props.disabled}
				className={className}
				label={<SelectPrimitive.ItemText className="text-foreground text-base" />}
			/>
		</SelectPrimitive.Item>
	);
}

function SelectSheetItem({ className, children, ...props }: SelectPrimitive.ItemProps) {
	const { value, onValueChange, onOpenChange } = SelectPrimitive.useRootContext();
	return (
		<MenuRow
			role="option"
			choice
			selected={value?.value === props.value}
			disabled={!!props.disabled}
			testID={props.testID}
			className={className}
			label={(children as React.ReactNode) ?? props.label}
			onPress={(e) => {
				props.onPress?.(e);
				onValueChange({ value: props.value, label: props.label });
				if (props.closeOnPress !== false) onOpenChange(false);
			}}
		/>
	);
}

function SelectSeparator({ className, ...props }: SelectPrimitive.SeparatorProps) {
	if (useSheet()) return <View {...props} className={cn('bg-border -mx-2 my-1 h-px', className)} />;
	return (
		<SelectPrimitive.Separator
			className={cn('bg-border -mx-1.5 my-1 h-px', className)}
			{...props}
		/>
	);
}

/**
 * Platform: WEB ONLY
 */
function SelectScrollUpButton({ className, ...props }: SelectPrimitive.ScrollUpButtonProps) {
	if (useSheet()) return null;
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
	if (useSheet()) return null;
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
	/** The trigger's testID; each option takes `${triggerTestID}-option-${value}`. */
	triggerTestID?: string;
	/** The root takes no aria props, so a field's label reference goes to the trigger. */
	'aria-labelledby'?: string;
	portalHost?: string;
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
	triggerTestID,
	'aria-labelledby': labelledBy,
	portalHost,
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
			{/* The trigger owns the dimmed look and the touch/native press guard: a root-only
			    `disabled` neither dims it nor stops a press from opening it. */}
			<SelectTrigger
				testID={triggerTestID}
				className={triggerClassName}
				disabled={props.disabled}
				aria-labelledby={labelledBy}
			>
				<SelectValue className={valueClassName} placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent matchWidth={matchWidth} portalHost={portalHost}>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem
							key={option.value}
							value={option.value}
							label={option.label}
							disabled={option.disabled}
							testID={triggerTestID ? `${triggerTestID}-option-${option.value}` : undefined}
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
