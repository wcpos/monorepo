import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import { Slot } from '@rn-primitives/slot';

import { Checkbox } from '../checkbox';
import { getDisplayLabel, getDisplayLabelEllipsis, toggleMultiValue } from '../lib/multi-select';
import { OVERLAY_MOTION, OVERLAY_PANEL, OverlayShell } from '../lib/overlay';
import { useIsPhone } from '../lib/device';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type {
	Option,
	SelectMultiRootContextType,
	SelectMultiRootProps,
	SelectValueProps,
} from './types';

/** Non-undefined option for internal use with multi-select utils */
type DefinedOption = NonNullable<Option>;

const SelectMultiContext = React.createContext<SelectMultiRootContextType | null>(null);

function useMultiSelectContext() {
	const context = React.useContext(SelectMultiContext);
	if (!context) {
		throw new Error('Multi-select compound components must be rendered inside <Select multiple>');
	}
	return context;
}

function SelectMultiRoot({
	children,
	value: valueProp,
	defaultValue,
	onValueChange: onValueChangeProp,
	onOpenChange: onOpenChangeProp,
	open: openProp,
	disabled,
}: SelectMultiRootProps) {
	const [value, onValueChange] = useControllableState<Option[]>({
		prop: valueProp,
		defaultProp: defaultValue ?? [],
		onChange: onValueChangeProp,
	});

	const [open, setOpen] = useControllableState<boolean>({
		prop: openProp,
		defaultProp: false,
		onChange: onOpenChangeProp,
	});

	const onOpenChange = React.useCallback((value: boolean) => setOpen(value), [setOpen]);

	const selectedValues: DefinedOption[] = (value ?? []).filter(
		(v): v is DefinedOption => v !== undefined
	);

	const isSelected = React.useCallback(
		(targetValue: string) => selectedValues.some((option) => option.value === targetValue),
		[selectedValues]
	);

	return (
		<SelectMultiContext.Provider
			value={{
				multiple: true,
				value: selectedValues,
				onValueChange: onValueChange as (options: Option[]) => void,
				isSelected,
				open: open ?? false,
				onOpenChange,
				disabled,
			}}
		>
			<PopoverPrimitive.Root onOpenChange={onOpenChange}>{children}</PopoverPrimitive.Root>
		</SelectMultiContext.Provider>
	);
}

function SelectMultiTrigger({
	className,
	children,
	disabled: disabledProp,
	...props
}: PopoverPrimitive.TriggerProps) {
	const { disabled: rootDisabled, open } = useMultiSelectContext();
	const disabled = Boolean(rootDisabled || disabledProp);

	return (
		<PopoverPrimitive.Trigger
			className={cn(
				className,
				open && 'border-ring',
				disabled && 'web:cursor-not-allowed opacity-45'
			)}
			disabled={disabled}
			{...props}
		>
			{children}
		</PopoverPrimitive.Trigger>
	);
}

function SelectMultiValue({
	asChild,
	placeholder,
	className,
	maxDisplayLength = 24,
	truncationStyle = '+N',
	...props
}: SelectValueProps) {
	const { value } = useMultiSelectContext();
	const textClass = React.useContext(TextClassContext);
	const Component = asChild ? Slot : Text;

	const displayText = React.useMemo(() => {
		const getter = truncationStyle === 'ellipsis' ? getDisplayLabelEllipsis : getDisplayLabel;
		return getter(value as DefinedOption[], placeholder, maxDisplayLength);
	}, [value, placeholder, maxDisplayLength, truncationStyle]);

	const hasValue = value.length > 0;

	return (
		<TextClassContext.Provider
			value={cn(textClass, 'text-base', !hasValue && 'text-muted-foreground', className)}
		>
			<Component {...props}>{displayText}</Component>
		</TextClassContext.Provider>
	);
}

function SelectMultiContent({
	className,
	children,
	align = 'start',
	sideOffset = 4,
	portalHost,
	inline,
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string; inline?: boolean }) {
	const context = useMultiSelectContext();
	const phone = useIsPhone();
	const presentation = phone ? 'bottom' : 'anchored';
	if (!context.open) return null;
	const content = (
		<SelectMultiContext.Provider value={context}>{children}</SelectMultiContext.Provider>
	);
	// Native full-bleed accessibility wrapper: see lib/overlay.tsx.
	const shell = (
		<OverlayShell
			presentation={presentation}
			open={context.open}
			Scrim={PopoverPrimitive.Overlay}
			onDismiss={phone ? () => context.onOpenChange(false) : undefined}
			testID={props.testID}
		>
			<TextClassContext.Provider value="text-foreground">
				{phone ? (
					<View
						testID={props.testID}
						className={cn(
							className,
							OVERLAY_PANEL.bottom,
							context.open ? OVERLAY_MOTION.bottom.enter : OVERLAY_MOTION.bottom.exit,
							'z-50'
						)}
					>
						{content}
					</View>
				) : (
					<PopoverPrimitive.Content
						align={align}
						sideOffset={sideOffset}
						className={cn(
							OVERLAY_PANEL.anchored,
							'z-50 max-h-96 min-w-32 p-1.5',
							context.open ? OVERLAY_MOTION.anchored.enter : OVERLAY_MOTION.anchored.exit,
							className
						)}
						{...props}
					>
						{content}
					</PopoverPrimitive.Content>
				)}
			</TextClassContext.Provider>
		</OverlayShell>
	);
	return inline ? (
		shell
	) : (
		<PopoverPrimitive.Portal hostName={portalHost}>{shell}</PopoverPrimitive.Portal>
	);
}

function SelectMultiItem({
	className,
	children,
	value,
	label,
	disabled,
	...props
}: {
	value: string;
	label: string;
	disabled?: boolean;
	className?: string;
	children?: React.ReactNode;
}) {
	const {
		onValueChange,
		isSelected,
		value: currentValue,
		disabled: rootDisabled,
	} = useMultiSelectContext();
	const itemDisabled = Boolean(rootDisabled || disabled);
	const selected = isSelected(value);

	const handlePress = React.useCallback(() => {
		const definedValues = currentValue.filter((v): v is DefinedOption => v !== undefined);
		onValueChange(toggleMultiValue(definedValues, { value, label }));
	}, [onValueChange, value, label, currentValue]);

	return (
		<Pressable
			onPress={handlePress}
			className={cn(
				'web:cursor-default web:select-none web:hover:bg-muted web:outline-none web:focus:bg-muted active:bg-muted min-h-row relative flex w-full flex-row items-center gap-2 rounded-md py-1.5 pr-2 pl-2',
				itemDisabled && 'web:pointer-events-none opacity-45',
				className
			)}
			disabled={itemDisabled}
			{...props}
		>
			<Checkbox
				checked={selected}
				onCheckedChange={() => handlePress()}
				className="pointer-events-none"
			/>
			<Text className="text-foreground text-base">{children ?? label}</Text>
		</Pressable>
	);
}

export {
	SelectMultiRoot,
	SelectMultiTrigger,
	SelectMultiValue,
	SelectMultiContent,
	SelectMultiItem,
	useMultiSelectContext,
};
