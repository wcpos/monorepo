import * as React from 'react';
import { View } from 'react-native';

import * as RadioGroupPrimitive from '@rn-primitives/radio-group';

import { HStack } from '../hstack';
import { Label } from '../label';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { VStack } from '../vstack';

type RadioGroupPrimitiveRootProps = React.ComponentProps<typeof RadioGroupPrimitive.Root>;
type RadioGroupProps = Omit<RadioGroupPrimitiveRootProps, 'onValueChange'> & {
	onValueChange?: RadioGroupPrimitiveRootProps['onValueChange'];
};
type RadioGroupContextValue = Pick<RadioGroupProps, 'value' | 'onValueChange' | 'disabled'>;

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);
const noopOnValueChange: NonNullable<RadioGroupProps['onValueChange']> = () => {};

function useRadioGroupContext() {
	const context = React.useContext(RadioGroupContext);
	if (!context) {
		throw new Error('RadioGroupOption must be rendered inside RadioGroup');
	}
	return context;
}

function RadioGroup({
	className,
	value,
	onValueChange,
	disabled = false,
	...props
}: RadioGroupProps) {
	return (
		<RadioGroupContext.Provider value={{ value, onValueChange, disabled }}>
			<RadioGroupPrimitive.Root
				className={cn('gap-2', className)}
				value={value}
				onValueChange={onValueChange ?? noopOnValueChange}
				disabled={disabled}
				{...props}
			/>
		</RadioGroupContext.Provider>
	);
}

function RadioGroupItem({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
	const { value: selectedValue, disabled } = useRadioGroupContext();
	return (
		<RadioGroupPrimitive.Item
			hitSlop={12}
			className={cn(
				'border-border bg-card size-5 items-center justify-center rounded-full border',
				props.value === selectedValue && 'border-primary',
				(props.disabled || disabled) && 'web:cursor-not-allowed opacity-45',
				className
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator className="flex items-center justify-center">
				<View className="bg-primary size-2.5 rounded-full" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

type RadioGroupOptionProps = Omit<
	React.ComponentProps<typeof RadioGroupPrimitive.Item>,
	'aria-describedby' | 'aria-labelledby' | 'children' | 'className'
> & {
	label: React.ReactNode;
	description?: React.ReactNode;
	className?: string;
	itemClassName?: string;
	labelClassName?: string;
	descriptionClassName?: string;
	right?: React.ReactNode;
};

function RadioGroupOption({
	className,
	description,
	descriptionClassName,
	disabled = false,
	itemClassName,
	label,
	labelClassName,
	right,
	value,
	...props
}: RadioGroupOptionProps) {
	const { disabled: groupDisabled, onValueChange, value: selectedValue } = useRadioGroupContext();
	const generatedID = React.useId().replace(/:/g, '');
	const labelID = `radio-group-option-${generatedID}`;
	const descriptionID = description ? `radio-group-option-description-${generatedID}` : undefined;
	const isDisabled = groupDisabled || disabled;

	return (
		// The item dims itself; the row dims only the text beside it, so nothing compounds.
		<HStack className={cn('items-start', className)} space="sm">
			<RadioGroupItem
				aria-describedby={descriptionID}
				aria-labelledby={labelID}
				disabled={isDisabled}
				value={value}
				className={itemClassName}
				{...props}
			/>
			<VStack className={cn('flex-1', isDisabled && 'opacity-45')} space="xs">
				<Label
					nativeID={labelID}
					className={labelClassName}
					onPress={() => {
						if (!isDisabled && value !== selectedValue) {
							onValueChange?.(value);
						}
					}}
				>
					{label}
				</Label>
				{description ? (
					<Text
						nativeID={descriptionID}
						className={cn('text-muted-foreground text-sm', descriptionClassName)}
					>
						{description}
					</Text>
				) : null}
			</VStack>
			{right}
		</HStack>
	);
}

export { RadioGroup, RadioGroupItem, RadioGroupOption };
