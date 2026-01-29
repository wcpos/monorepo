import * as React from 'react';
import {
	NativeSyntheticEvent,
	TextInput as RNTextInput,
	TextInputKeyPressEventData,
	View,
} from 'react-native';

import { useAugmentedRef } from '@rn-primitives/hooks';
import toNumber from 'lodash/toNumber';

import useMergedRef from '@wcpos/hooks/use-merged-ref';

import { useCalculator } from './use-calculator';
import { Button, ButtonText } from '../button';
import { HStack } from '../hstack';
import { Icon, IconName } from '../icon';
import { IconButton } from '../icon-button';
import { Input, InputProps } from '../input';
import { Text } from '../text';
import { VStack } from '../vstack';

const Display = React.forwardRef<RNTextInput, InputProps>(
	({ selection, onSelectionChange, ...props }, ref) => {
		const inputRef = React.useRef<RNTextInput>(null);
		const mergedRef = useMergedRef(ref, inputRef);
		/**
		 *
		 */
		const handleBackspacePress = React.useCallback(() => {
			if (props.onKeyPress) {
				props.onKeyPress({ nativeEvent: { key: 'Backspace' } as TextInputKeyPressEventData });
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
		React.useEffect(
			() => {
				const timer = setTimeout(() => {
					if (inputRef.current) {
						inputRef.current?.focus();
						inputRef.current?.setSelectionRange(0, props.value?.length || 100);
					}
				}, 50);
				return () => clearTimeout(timer);
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally empty - run once on mount
			[]
		);

		return (
			<Input.Root {...props}>
				<Input.InputField ref={mergedRef} type="numeric" {...props} />
				<Input.Right className="pr-1">
					<IconButton name="deleteLeft" onPress={handleBackspacePress} />
				</Input.Right>
			</Input.Root>
		);
	}
);

Display.displayName = 'NumpadDisplay';

interface NumpadKeyProps {
	label?: string;
	icon?: IconName;
	onPress: () => void;
	discount?: boolean;
}

const Key = ({ label, icon, onPress, discount }: NumpadKeyProps) => (
	<Button variant="muted" onPress={onPress} rightIcon={discount ? 'percent' : undefined}>
		{icon ? <Icon name={icon} /> : <ButtonText>{label}</ButtonText>}
	</Button>
);

Key.displayName = 'NumpadKey';

interface NumpadProps {
	initialValue?: number;
	calculator?: boolean;
	onChangeText?: (value: number) => void;
	onSubmitEditing?: (value: string) => void;
	decimalSeparator?: string;
	discounts?: number[];
	precision?: number;
	columnSize?: number;
	formatDisplay?: (value: number) => string;
}

/**
 * To avoid confusion, initialValue should be a number and it should emit a number rounded to precision (6)
 * - for the reducer we need to use strings, but at least we know that the deceimal separator is a dot
 */
export const Numpad = React.forwardRef<React.ElementRef<typeof Display>, NumpadProps>(
	(
		{
			initialValue = 0,
			calculator = false,
			onChangeText,
			decimalSeparator = '.',
			onSubmitEditing,
			discounts,
			precision = 6,
			columnSize = 45,
			formatDisplay = (value) => String(value),
		},
		ref
	) => {
		const { currentOperand, addDigit, switchSign, deleteDigit, applyDiscount } = useCalculator({
			initialValue: String(initialValue),
			decimalSeparator,
			precision,
		});
		const currentValue = toNumber(currentOperand);
		const hasDiscounts = discounts && discounts.length > 0;

		/**
		 * Allow external components to get the current value
		 */
		const augmentedRef = useAugmentedRef({
			ref,
			methods: {
				getValue: () => currentValue,
			},
			deps: [currentValue],
		});

		/**
		 *
		 */
		const handleKeyPress = React.useCallback(
			(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
				let shouldReplace = false;
				if (augmentedRef && augmentedRef.current) {
					shouldReplace = augmentedRef.current?.selectionStart === 0;
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
			[augmentedRef, deleteDigit, decimalSeparator, addDigit]
		);

		/**
		 *
		 */
		const handleButtonPress = React.useCallback(
			(key: string) => {
				let shouldReplace = false;
				if (augmentedRef && augmentedRef.current) {
					shouldReplace = augmentedRef.current?.selectionStart === 0;
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
				if (augmentedRef && augmentedRef.current) {
					augmentedRef.current?.focus();
					augmentedRef.current?.setSelectionRange(100, 100);
				}
			},
			[addDigit, augmentedRef, decimalSeparator, switchSign]
		);

		/**
		 *
		 */
		return (
			<VStack style={{ width: hasDiscounts ? '222px' : '146px' }}>
				<Display
					ref={augmentedRef}
					value={formatDisplay(currentValue)}
					onSubmitEditing={() => onChangeText?.(currentValue)}
					onKeyPress={handleKeyPress}
					// selection={selection}
					// onSelectionChange={setSelection}
				/>
				<HStack className="gap-1">
					<View className="grid grid-cols-3 gap-1" style={{ width: '146px' }}>
						{[
							['1', '2', '3'],
							['4', '5', '6'],
							['7', '8', '9'],
							['+/-', '0', decimalSeparator],
						].map((row, rowIndex) =>
							row.map((value, colIndex) => (
								<Key
									key={`${rowIndex}-${colIndex}`}
									label={value === '+/-' ? undefined : value}
									icon={value === '+/-' ? 'plusMinus' : undefined}
									onPress={() => handleButtonPress(value)}
								/>
							))
						)}
					</View>
					{hasDiscounts && (
						<View className="grid grid-cols-1 gap-1" style={{ width: '72px' }}>
							{discounts.map((discount) => (
								<Button key={discount} variant="muted" onPress={() => applyDiscount(discount)}>
									<HStack className="gap-0.5">
										<Text>{String(discount)}</Text>
										<Icon name="percent" />
									</HStack>
								</Button>
							))}
						</View>
					)}
				</HStack>
		</VStack>
	);
	}
);

Numpad.displayName = 'Numpad';
