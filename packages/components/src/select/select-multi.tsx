import * as React from 'react';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import { Slot } from '@rn-primitives/slot';

import { fieldBox } from '../field-box';
import { getDisplayLabel, getDisplayLabelEllipsis, toggleMultiValue } from '../lib/multi-select';
import { AnchoredOverlay } from '../lib/overlay';
import { cn } from '../lib/utils';
import { MenuRow } from '../menu-row';
import { POPOVER_ANCHOR } from '../popover/anchor';
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
			className={cn(fieldBox({ state: disabled ? 'disabled' : open ? 'open' : 'rest' }), className)}
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
	children,
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string; inline?: boolean }) {
	const context = useMultiSelectContext();
	// The popover root owns the open state; the multi context mirrors it. A dismiss must go
	// through the root, or the trigger's next press closes a popover that is already hidden.
	const { open, onOpenChange } = PopoverPrimitive.useRootContext();
	if (!context.open) return null;
	return (
		<AnchoredOverlay
			anchor={POPOVER_ANCHOR}
			open={open}
			onOpenChange={onOpenChange}
			size="max-h-96 min-w-32 p-1.5"
			content={{
				align: 'start',
				...props,
				children: (
					<SelectMultiContext.Provider value={context}>{children}</SelectMultiContext.Provider>
				),
			}}
		/>
	);
}

function SelectMultiItem({
	className,
	children,
	value,
	label,
	disabled,
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
		<MenuRow
			checkbox
			selected={selected}
			onPress={handlePress}
			disabled={itemDisabled}
			className={className}
			label={children ?? label}
		/>
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
