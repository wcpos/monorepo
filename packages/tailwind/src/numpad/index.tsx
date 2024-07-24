import * as React from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import get from 'lodash/get';

import Icon, { IconName } from '@wcpos/components/src/icon';
import useFocusTrap from '@wcpos/hooks/src/use-focus-trap';

import { reducer, ACTIONS, Action, Config, CalculatorState } from './reducer';
import { Button, ButtonText } from '../button';
import { HStack } from '../hstack';
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
export const Numpad = ({
	initialValue = '0',
	calculator = false,
	onChange,
	decimalSeparator = '.',
	thousandSeparator = ',',
	onSubmitEditing,
	discounts,
	precision = 6,
}: NumpadProps) => {
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
				ref={focusTrapRef}
				value={currentOperand || ''}
				selectTextOnFocus
				onSelectionChange={(e) => {
					setTextSelected(e.nativeEvent.selection.start !== e.nativeEvent.selection.end);
				}}
				readonly
				onKeyPress={handleKeyPress}
				onChangeText={() => {}} // NOTE: needs onChangeText to become controlled
				// rightAccessory={
				// 	<Box paddingRight="small">
				// 		<Icon name="deleteLeft" onPress={() => dispatch({ type: ACTIONS.DELETE_DIGIT })} />
				// 	</Box>
				// }
			/>
			<HStack space="xs">
				<VStack space="xs">
					<HStack space="xs">
						<Button onPress={() => addDigit('1')}>
							<ButtonText>1</ButtonText>
						</Button>
						<Button onPress={() => addDigit('2')}>
							<ButtonText>2</ButtonText>
						</Button>
						<Button onPress={() => addDigit('3')}>
							<ButtonText>3</ButtonText>
						</Button>
					</HStack>
					<HStack space="xs">
						<Button onPress={() => addDigit('4')}>
							<ButtonText>4</ButtonText>
						</Button>
						<Button onPress={() => addDigit('5')}>
							<ButtonText>5</ButtonText>
						</Button>
						<Button onPress={() => addDigit('6')}>
							<ButtonText>6</ButtonText>
						</Button>
					</HStack>
					<HStack space="xs">
						<Button onPress={() => addDigit('7')}>
							<ButtonText>7</ButtonText>
						</Button>
						<Button onPress={() => addDigit('8')}>
							<ButtonText>8</ButtonText>
						</Button>
						<Button onPress={() => addDigit('9')}>
							<ButtonText>9</ButtonText>
						</Button>
					</HStack>
					<HStack space="xs">
						<Button onPress={() => dispatch({ type: ACTIONS.SWITCH_SIGN })}>
							<Icon name="plusMinus" size="xSmall" type="inverse" />
						</Button>
						<Button onPress={() => addDigit('0')}>
							<ButtonText>0</ButtonText>
						</Button>
						<Button onPress={() => addDigit(decimalSeparator)}>
							<ButtonText>{decimalSeparator}</ButtonText>
						</Button>
					</HStack>
				</VStack>
				{discounts && (
					<VStack space="xs">
						{discounts.map((discount) => (
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
					</VStack>
				)}
				{calculator && (
					<VStack space="xs">
						<Button onPress={() => chooseOperation('÷')}>
							<Icon name="divide" size="xSmall" type="inverse" />
						</Button>
						<Button onPress={() => chooseOperation('*')}>
							<Icon name="xmark" size="xSmall" type="inverse" />
						</Button>
						<Button onPress={() => chooseOperation('+')}>
							<Icon name="plus" size="xSmall" type="inverse" />
						</Button>
						<Button onPress={() => chooseOperation('-')}>
							<Icon name="minus" size="xSmall" type="inverse" />
						</Button>
					</VStack>
				)}
			</HStack>
			{calculator && (
				<HStack space="xs">
					<Button onPress={() => dispatch({ type: ACTIONS.CLEAR })}>
						<ButtonText>Clear</ButtonText>
					</Button>
					<Button onPress={() => dispatch({ type: ACTIONS.EVALUATE })}>
						<Icon name="equals" size="xSmall" />
					</Button>
				</HStack>
			)}
		</VStack>
	);
};
