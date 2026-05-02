import * as React from 'react';
import { View } from 'react-native';

import * as RadioGroupPrimitive from '@rn-primitives/radio-group';

import { HStack } from '../hstack';
import { Label } from '../label';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { VStack } from '../vstack';

type RadioGroupContextValue = Pick<
	React.ComponentProps<typeof RadioGroupPrimitive.Root>,
	'value' | 'onValueChange' | 'disabled'
>;

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

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
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupContext.Provider value={{ value, onValueChange, disabled }}>
			<RadioGroupPrimitive.Root
				className={cn('web:grid gap-2', className)}
				value={value}
				onValueChange={onValueChange}
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
	return (
		<RadioGroupPrimitive.Item
			className={cn(
				'native:h-5 native:w-5 web:ring-offset-background web:focus:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 border-primary text-primary aspect-square h-4 w-4 items-center justify-center rounded-full border',
				props.disabled && 'web:cursor-not-allowed opacity-50',
				className
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator className="flex items-center justify-center">
				<View className="native:h-[10] native:w-[10] bg-primary aspect-square h-[9px] w-[9px] rounded-full" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

type RadioGroupOptionProps = Omit<
	React.ComponentProps<typeof RadioGroupPrimitive.Item>,
	'aria-labelledby' | 'children' | 'className'
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
	const { disabled: groupDisabled, onValueChange } = useRadioGroupContext();
	const generatedID = React.useId().replace(/:/g, '');
	const labelID = `radio-group-option-${generatedID}`;
	const isDisabled = groupDisabled || disabled;

	return (
		<HStack className={cn('items-start', isDisabled && 'opacity-50', className)} space="sm">
			<RadioGroupItem
				aria-labelledby={labelID}
				disabled={isDisabled}
				value={value}
				className={itemClassName}
				{...props}
			/>
			<VStack className="flex-1" space="xs">
				<Label
					nativeID={labelID}
					className={labelClassName}
					onPress={() => {
						if (!isDisabled) {
							onValueChange(value);
						}
					}}
				>
					{label}
				</Label>
				{description ? (
					<Text className={cn('text-muted-foreground text-sm', descriptionClassName)}>
						{description}
					</Text>
				) : null}
			</VStack>
			{right}
		</HStack>
	);
}

export { RadioGroup, RadioGroupItem, RadioGroupOption };
