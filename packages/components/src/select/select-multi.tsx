import * as React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';
import * as PopoverPrimitive from '@rn-primitives/popover';
import * as Slot from '@rn-primitives/slot';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Checkbox } from '../checkbox';
import {
	getDisplayLabel,
	getDisplayLabelEllipsis,
	isSelectedIn,
	toggleMultiValue,
} from '../lib/multi-select';
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

	const [open, onOpenChange] = useControllableState<boolean>({
		prop: openProp,
		defaultProp: false,
		onChange: onOpenChangeProp,
	});

	const selectedValues: DefinedOption[] = (value ?? []).filter(
		(v): v is DefinedOption => v !== undefined
	);

	const isSelected = React.useCallback(
		(targetValue: string) => isSelectedIn(selectedValues, targetValue, true),
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
				onOpenChange: onOpenChange as (open: boolean) => void,
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
	const { disabled: rootDisabled } = useMultiSelectContext();
	const disabled = disabledProp ?? rootDisabled;

	return (
		<PopoverPrimitive.Trigger
			className={cn(disabled && 'web:cursor-not-allowed opacity-50', className)}
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
	const Component = asChild ? Slot.Text : Text;

	const definedValues = value.filter((v): v is DefinedOption => v !== undefined);

	const displayText = React.useMemo(() => {
		const getter = truncationStyle === 'ellipsis' ? getDisplayLabelEllipsis : getDisplayLabel;
		return getter(definedValues, placeholder, maxDisplayLength);
	}, [definedValues, placeholder, maxDisplayLength, truncationStyle]);

	const hasValue = value.length > 0;

	return (
		<TextClassContext.Provider
			value={cn('text-sm', hasValue ? 'text-foreground' : 'text-muted-foreground', className)}
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
	...props
}: PopoverPrimitive.ContentProps & { portalHost?: string }) {
	const context = useMultiSelectContext();

	if (!context.open) return null;

	return (
		<PopoverPrimitive.Portal hostName={portalHost}>
			<PopoverPrimitive.Overlay style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}>
				<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut}>
					<TextClassContext.Provider value="text-popover-foreground">
						<PopoverPrimitive.Content
							align={align}
							sideOffset={sideOffset}
							className={cn(
								'border-border bg-popover web:data-[side=bottom]:slide-in-from-top-2 web:data-[side=left]:slide-in-from-right-2 web:data-[side=right]:slide-in-from-left-2 web:data-[side=top]:slide-in-from-bottom-2 web:animate-in web:zoom-in-95 web:fade-in-0 z-50 max-h-96 min-w-32 rounded-md border px-1 py-2 shadow-md',
								className
							)}
							{...props}
						>
							<SelectMultiContext.Provider value={context}>{children}</SelectMultiContext.Provider>
						</PopoverPrimitive.Content>
					</TextClassContext.Provider>
				</Animated.View>
			</PopoverPrimitive.Overlay>
		</PopoverPrimitive.Portal>
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
	const { onValueChange, isSelected, value: currentValue } = useMultiSelectContext();
	const selected = isSelected(value);

	const handlePress = React.useCallback(() => {
		const definedValues = currentValue.filter((v): v is DefinedOption => v !== undefined);
		onValueChange(toggleMultiValue(definedValues, { value, label }));
	}, [onValueChange, value, label, currentValue]);

	return (
		<Pressable
			onPress={handlePress}
			className={cn(
				'web:group web:cursor-default web:select-none web:hover:bg-accent/50 web:outline-none web:focus:bg-accent active:bg-accent relative flex w-full flex-row items-center gap-2 rounded-sm py-1.5 pr-2 pl-2',
				disabled && 'web:pointer-events-none opacity-50',
				className
			)}
			disabled={disabled}
			{...props}
		>
			<Checkbox
				checked={selected}
				onCheckedChange={() => handlePress()}
				className="pointer-events-none"
			/>
			<Text className="web:group-focus:text-accent-foreground text-popover-foreground text-sm">
				{children ?? label}
			</Text>
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
