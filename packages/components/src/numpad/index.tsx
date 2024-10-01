import * as React from 'react';
import {
	TextInput as RNTextInput,
	View,
	NativeSyntheticEvent,
	TextInputKeyPressEventData,
} from 'react-native';

import { useAugmentedRef } from '@rn-primitives/hooks';

import useMergedRef from '@wcpos/hooks/src/use-merged-ref';

import { useCalculator } from './use-calculator';
import { Button, ButtonText } from '../button';
import { Icon, IconName } from '../icon';
import { IconButton } from '../icon-button';
import { Input, InputProps } from '../input';
import { VStack } from '../vstack';

const iconMap: Record<string, IconName> = {
	'%': 'percent',
	'+': 'plus',
	'-': 'minus',
	'*': 'xmark',
	'÷': 'divide',
};

const Display = React.forwardRef<RNTextInput, InputProps>(({ ...props }, ref) => {
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

	return (
		<Input.Root {...props}>
			<Input.InputField ref={mergedRef} autoFocus {...props} />
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
}

const Key = ({ label, icon, onPress }: NumpadKeyProps) => (
	<Button variant="muted" onPress={onPress}>
		{icon ? <Icon name={icon} /> : <ButtonText>{label}</ButtonText>}
	</Button>
);

Key.displayName = 'NumpadKey';

interface ButtonGridProps {
	children: React.ReactNode;
	columns: number;
}

const Grid = ({ children, columns }: ButtonGridProps) => (
	<View className={`grid gap-1 grid-cols-${columns}`}>{children}</View>
);

Grid.displayName = 'NumpadGrid';

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
		const { currentOperand, addDigit, chooseOperation, handleKeyPress } = useCalculator({
			initialValue: String(initialValue),
			decimalSeparator,
			precision,
		});
		const currentValue = parseFloat(currentOperand || '0');
		console.log(currentOperand);

		const totalWidth = React.useMemo(() => {
			const baseWidth = columnSize * 3;
			return baseWidth + (discounts && discounts.length > 0 ? columnSize : 0);
		}, [columnSize, discounts]);

		const handleKeyPressEvent = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			handleKeyPress(e.nativeEvent.key);
		};

		const augmentedRef = useAugmentedRef({
			ref,
			methods: {
				getValue: () => currentValue,
			},
			deps: [currentValue],
		});

		return (
			<VStack style={{ width: totalWidth }}>
				<Display
					ref={augmentedRef}
					value={formatDisplay(currentValue)}
					onSubmitEditing={() => onChangeText?.(currentValue)}
					onKeyPress={handleKeyPressEvent}
				/>
				<Grid columns={discounts ? 2 : 1}>
					<Grid columns={3}>
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
											? chooseOperation('SWITCH_SIGN')
											: value === decimalSeparator
												? addDigit('.', false)
												: addDigit(value, false)
									}
								/>
							))
						)}
					</Grid>
					<Grid columns={1}>
						{discounts &&
							discounts.map((discount) => (
								<Key key={discount.label} label={discount.label} onPress={discount.onPress} />
							))}
					</Grid>
				</Grid>
			</VStack>
		);
	}
);
