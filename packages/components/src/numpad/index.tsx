import * as React from 'react';
import {
	NativeSyntheticEvent,
	TextInput as RNTextInput,
	TextInputKeyPressEventData,
} from 'react-native';

import toNumber from 'lodash/toNumber';

import { useMergedRef } from '@wcpos/hooks/use-merged-ref';

import { useCalculator } from './use-calculator';
import { HStack } from '../hstack';
import { IconButton } from '../icon-button';
import { Input, InputProps } from '../input';
import { Keypad } from '../keypad';
import { VStack } from '../vstack';

type TextInputKeyPressEvent = NativeSyntheticEvent<TextInputKeyPressEventData>;

function Display({ selection, onSelectionChange, className, disabled, ref, ...props }: InputProps) {
	const inputRef = React.useRef<RNTextInput>(null);
	const mergedRef = useMergedRef(ref ?? null, inputRef);
	/**
	 *
	 */
	const handleBackspacePress = React.useCallback(() => {
		if (props.onKeyPress) {
			props.onKeyPress({
				nativeEvent: { key: 'Backspace' },
			} as TextInputKeyPressEvent);
		}
		if (inputRef?.current) {
			inputRef?.current.focus();
		}
	}, [props, inputRef]);

	/**
	 * Focus and select all text on mount
	 *
	 * @FIXME - the autofocus doesn't seem to work, perhaps it's not on the screen yet?
	 * - so we use a timer to focus after a short delay
	 */
	React.useEffect(() => {
		const timer = setTimeout(() => {
			if (inputRef.current) {
				inputRef.current?.focus();
				const webInput = inputRef.current as unknown as HTMLInputElement | undefined;
				webInput?.setSelectionRange?.(0, 100);
			}
		}, 50);
		return () => clearTimeout(timer);
	}, []);

	return (
		<Input.Root className={className} disabled={disabled}>
			<Input.InputField
				ref={mergedRef}
				type="numeric"
				className={className}
				placeholderTextColor={undefined}
				{...props}
			/>
			<Input.Right className="pr-1">
				<IconButton name="deleteLeft" onPress={handleBackspacePress} />
			</Input.Right>
		</Input.Root>
	);
}

Display.displayName = 'NumpadDisplay';

interface NumpadProps {
	ref?: React.Ref<{ getValue: () => number } | null>;
	initialValue?: number;
	calculator?: boolean;
	onChangeText?: (value: number) => void;
	onSubmitEditing?: (value: string) => void;
	decimalSeparator?: string;
	discounts?: number[];
	precision?: number;
	formatDisplay?: (value: number) => string;
}

/**
 * To avoid confusion, initialValue should be a number and it should emit a number rounded to precision (6)
 * - for the reducer we need to use strings, but at least we know that the deceimal separator is a dot
 */
function Numpad({
	ref,
	initialValue = 0,
	calculator = false,
	onChangeText,
	decimalSeparator = '.',
	onSubmitEditing,
	discounts,
	precision = 6,
	formatDisplay = (value) => String(value),
}: NumpadProps) {
	const { currentOperand, addDigit, switchSign, deleteDigit, applyDiscount } = useCalculator({
		initialValue: String(initialValue),
		decimalSeparator,
		precision,
	});
	const currentValue = toNumber(currentOperand);
	const hasDiscounts = discounts && discounts.length > 0;

	const localRef = React.useRef<RNTextInput>(null);

	React.useImperativeHandle(
		ref,
		() => ({
			getValue: () => currentValue,
		}),
		[currentValue]
	);

	const handleSubmitEditing = React.useCallback(() => {
		onChangeText?.(currentValue);
		onSubmitEditing?.(String(currentValue));
	}, [currentValue, onChangeText, onSubmitEditing]);

	/**
	 *
	 */
	const handleKeyPress = React.useCallback(
		(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			let shouldReplace = false;
			if (localRef.current) {
				const webInput = localRef.current as unknown as HTMLInputElement | undefined;
				if (webInput?.selectionStart !== undefined) {
					shouldReplace = webInput.selectionStart === 0;
				}
			}
			const key = e.nativeEvent.key;
			switch (key) {
				case 'Backspace':
					deleteDigit();
					break;
				case decimalSeparator:
					addDigit('.', shouldReplace);
					break;
				default:
					if (/^[0-9]$/.test(key)) {
						addDigit(key, shouldReplace);
					}
			}
		},
		[deleteDigit, decimalSeparator, addDigit]
	);

	/**
	 *
	 */
	const handleButtonPress = React.useCallback(
		(key: string) => {
			let shouldReplace = false;
			if (localRef.current) {
				const webInput = localRef.current as unknown as HTMLInputElement | undefined;
				if (webInput?.selectionStart !== undefined) {
					shouldReplace = webInput.selectionStart === 0;
				}
			}
			switch (key) {
				case '+/-':
					switchSign();
					break;
				case decimalSeparator:
					addDigit('.', shouldReplace);
					break;
				default:
					addDigit(key, shouldReplace);
			}
			// after a button press, we want to focus the input
			if (localRef.current) {
				localRef.current?.focus();
				const webInput = localRef.current as unknown as HTMLInputElement | undefined;
				webInput?.setSelectionRange?.(100, 100);
			}
		},
		[addDigit, decimalSeparator, switchSign]
	);

	/**
	 *
	 */
	return (
		<VStack className="gap-2 self-start">
			<Display
				ref={localRef}
				value={formatDisplay(currentValue)}
				onSubmitEditing={handleSubmitEditing}
				onKeyPress={handleKeyPress}
				// selection={selection}
				// onSelectionChange={setSelection}
			/>
			<HStack className="gap-2">
				<Keypad
					className="w-52"
					fit="tile"
					onPress={handleButtonPress}
					rows={[
						...['123', '456', '789'].map((row) =>
							[...row].map((value) => ({ value, label: value, testID: `numpad-key-${value}` }))
						),
						[
							{
								value: '+/-',
								icon: 'plusMinus',
								accessibilityLabel: '+/-',
								testID: 'numpad-key-icon-plusMinus',
							},
							{ value: '0', label: '0', testID: 'numpad-key-0' },
							{ value: decimalSeparator, label: decimalSeparator, testID: 'numpad-key-decimal' },
						],
					]}
				/>
				{hasDiscounts && (
					<Keypad
						className="w-tile"
						fit="tile"
						onPress={(value) => applyDiscount(Number(value))}
						rows={discounts.map((discount) => [{ value: String(discount), label: `${discount}%` }])}
					/>
				)}
			</HStack>
		</VStack>
	);
}

Numpad.displayName = 'Numpad';

export { Numpad };
