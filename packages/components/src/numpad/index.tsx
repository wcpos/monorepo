import * as React from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import get from 'lodash/get';

import useFocusTrap from '@wcpos/hooks/src/use-focus-trap';

import { reducer, ACTIONS, Action, Config, CalculatorState } from './reducer';
import { Box } from '../box';
import { Button, ButtonText } from '../button';
import { Icon, IconName } from '../icon';
import { Input } from '../input';
import { VStack } from '../vstack';

export interface NumpadProps {
	/**  */
	initialValue?: string;

	/**  */
	calculator?: boolean;

	/** Emits on every change */
	onChange?: (value: string) => void;

	/** Triggers with the return key (returnKeyType) has been pressed */
	onSubmitEditing?: (value: string) => void;

	/** Decimal or comma */
	decimalSeparator?: string;

	/** Decimal or comma */
	thousandSeparator?: string;

	/** Discounts to show */
	discounts?: number[];

	/** Number of decimal places to round to */
	precision?: number;
}

const iconMap: Record<string, IconName> = {
	'%': 'percent',
	'+': 'plus',
	'-': 'minus',
	'*': 'xmark',
	'÷': 'divide',
};

const columnSize = 45;

/**
 * TODO: handle partial selected text?
 */
export const Numpad = React.forwardRef<React.ElementRef<typeof Input>, any>(
	(
		{
			initialValue = '0',
			calculator = false,
			onChange,
			decimalSeparator = '.',
			thousandSeparator = ',',
			onSubmitEditing,
			discounts,
			precision = 6,
		},
		ref
	) => {
		const [textSelected, setTextSelected] = React.useState(false);
		const focusTrapRef = useFocusTrap();

		/**
		 * Reducer config
		 */
		const reducerConfig = React.useMemo<Config>(
			() => ({
				decimalSeparator,
				precision,
			}),
			[decimalSeparator, precision]
		);

		/**
		 *
		 */
		const [{ currentOperand, previousOperand, operation }, dispatch] = React.useReducer(
			(state: CalculatorState, action: Action) => reducer(state, action, reducerConfig),
			{
				currentOperand: initialValue,
				previousOperand: '0',
				operation: '',
			}
		);

		/**
		 *
		 */
		React.useEffect(() => {
			onChange && onChange(currentOperand || '');
		}, [currentOperand, onChange]);

		/**
		 *
		 */
		const addDigit = React.useCallback(
			(digit: string) => {
				dispatch({
					type: ACTIONS.ADD_DIGIT,
					payload: { digit, overwrite: textSelected },
				});
				// @FIXME - this is a hack to make sure overwrite is not left on
				setTextSelected(false);
			},
			[textSelected]
		);

		/**
		 *
		 */
		const chooseOperation = React.useCallback((operation: string) => {
			dispatch({ type: ACTIONS.CHOOSE_OPERATION, payload: { operation } });
		}, []);

		/**
		 * dispatch integers to reducer
		 * also handle backspace
		 */
		const handleKeyPress = React.useCallback(
			(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
				const key = get(e, 'nativeEvent.key');

				switch (key) {
					case 'Backspace':
						dispatch({ type: ACTIONS.DELETE_DIGIT });
						break;
					case 'Enter':
						onSubmitEditing?.(currentOperand || '');
						break;
					case decimalSeparator:
						if (!currentOperand.includes(decimalSeparator)) {
							dispatch({
								type: ACTIONS.ADD_DIGIT,
								payload: { digit: key, overwrite: textSelected },
							});
						}
						break;
					default:
						if (/^[0-9]$/.test(key)) {
							dispatch({
								type: ACTIONS.ADD_DIGIT,
								payload: { digit: key, overwrite: textSelected },
							});
						}
				}
			},
			[currentOperand, decimalSeparator, onSubmitEditing, textSelected]
		);

		/**
		 *
		 */
		const totalWidth = React.useMemo(() => {
			const baseWidth = columnSize * 3;
			return (
				baseWidth +
				(calculator ? columnSize : 0) +
				(discounts && discounts.length > 0 ? columnSize : 0)
			);
		}, [calculator, discounts]);

		/**
		 *
		 */
		return (
			<VStack>
				<Input
					// ref={focusTrapRef}
					ref={ref}
					value={currentOperand || ''}
					selectTextOnFocus
					onSelectionChange={(e) => {
						setTextSelected(e.nativeEvent.selection.start !== e.nativeEvent.selection.end);
					}}
					readonly
					onKeyPress={handleKeyPress}
					onChangeText={() => {}}
				/>
				<Box className={`grid gap-1 ${discounts ? 'grid-cols-4' : 'grid-cols-3'}`}>
					{[
						['1', '2', '3'],
						['4', '5', '6'],
						['7', '8', '9'],
						['+/-', '0', decimalSeparator],
					].map((row, rowIndex) =>
						row.map((value, colIndex) => (
							<Button
								key={`${rowIndex}-${colIndex}`}
								onPress={() =>
									value === '+/-' ? dispatch({ type: ACTIONS.SWITCH_SIGN }) : addDigit(value)
								}
							>
								<ButtonText>{value}</ButtonText>
							</Button>
						))
					)}
					{calculator &&
						['÷', '*', '+', '-'].map((op) => (
							<Button key={op} onPress={() => chooseOperation(op)}>
								<Icon name={iconMap[op]} />
							</Button>
						))}
					{discounts &&
						discounts.map((discount) => (
							<Button
								key={discount}
								onPress={() =>
									dispatch({
										type: ACTIONS.APPLY_DISCOUNT,
										payload: { discount },
									})
								}
							>
								<ButtonText>{`${discount}%`}</ButtonText>
							</Button>
						))}
				</Box>
				{calculator && (
					<Box className="grid grid-cols-2 gap-1">
						<Button onPress={() => dispatch({ type: ACTIONS.CLEAR })}>
							<ButtonText>Clear</ButtonText>
						</Button>
						<Button onPress={() => dispatch({ type: ACTIONS.EVALUATE })}>
							<Icon name="equals" />
						</Button>
					</Box>
				)}
			</VStack>
		);
	}
);
