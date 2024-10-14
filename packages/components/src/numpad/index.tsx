import * as React from 'react';
import {
	TextInput as RNTextInput,
	View,
	NativeSyntheticEvent,
	TextInputKeyPressEventData,
} from 'react-native';

import { useAugmentedRef } from '@rn-primitives/hooks';
import toNumber from 'lodash/toNumber';

import useMergedRef from '@wcpos/hooks/src/use-merged-ref';

import { useCalculator } from './use-calculator';
import { Button, ButtonText } from '../button';
import { HStack } from '../hstack';
import { Icon, IconName } from '../icon';
import { IconButton } from '../icon-button';
import { Input, InputProps } from '../input';
import { Text } from '../text';
import { VStack } from '../vstack';

const iconMap: Record<string, IconName> = {
	'%': 'percent',
	'+': 'plus',
	'-': 'minus',
	'*': 'xmark',
	'÷': 'divide',
};

const Display = React.forwardRef<
	RNTextInput,
	InputProps & {
		selection: { start: number; end: number };
		onSelectionChange: (sel: { start: number; end: number }) => void;
	}
>(({ selection, onSelectionChange, ...props }, ref) => {
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
	 * HACK: the focus doesn't seem to work, perhaps it's not on the screen yet?
	 * - so we use a timer to focus after a short delay
	 */
	React.useEffect(
		() => {
			const timer = setTimeout(() => {
				if (inputRef.current && props.value) {
					inputRef.current.focus();
					onSelectionChange({ start: 0, end: props.value.length });
				}
			}, 100);
			return () => clearTimeout(timer);
		},
		[
			// run once on mount
		]
	);

	/**
	 * Focus and move cursor to the end of the text when value changes (e.g. after button press)
	 */
	React.useEffect(() => {
		if (props.value) {
			if (inputRef.current && props.value) {
				inputRef.current.focus();
				onSelectionChange({ start: props.value.length, end: props.value.length });
			}
		}
	}, [onSelectionChange, props.value]);

	return (
		<Input.Root {...props}>
			<Input.InputField
				ref={mergedRef}
				{...props}
				autoFocus
				selection={selection}
				onSelectionChange={(event) => {
					onSelectionChange(event.nativeEvent.selection);
				}}
			/>
			<Input.Right className="pr-1">
				<IconButton name="deleteLeft" onPress={handleBackspacePress} />
			</Input.Right>
		</Input.Root>
	);
});

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
		 * Selection state
		 */
		const [selection, setSelection] = React.useState<{ start: number; end: number }>({
			start: 0,
			end: 0,
		});
		const shouldReplace = selection.start === 0 && selection.end === (currentOperand?.length || 0);

		/**
		 *
		 */
		const handleKeyPress = React.useCallback(
			(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
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
			[deleteDigit, decimalSeparator, addDigit, shouldReplace]
		);

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
		return (
			<VStack style={{ width: hasDiscounts ? '222px' : '146px' }}>
				<Display
					ref={augmentedRef}
					value={formatDisplay(currentValue)}
					onSubmitEditing={() => onChangeText?.(currentValue)}
					onKeyPress={handleKeyPress}
					selection={selection}
					onSelectionChange={setSelection}
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
									onPress={() =>
										value === '+/-'
											? switchSign()
											: value === decimalSeparator
												? addDigit('.', shouldReplace)
												: addDigit(value, shouldReplace)
									}
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
