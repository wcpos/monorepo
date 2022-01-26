import * as React from 'react';
// import useKey from '@wcpos/common/src/hooks/use-key';
import useAllKeysPress from '@wcpos/common/src/hooks/useAllKeysPress';
import Icon from '../icon';
import Box from '../box';
import Text from '../text';
import Button from '../button';
import { reducer, formatOperand, ACTIONS } from './reducer';
import DigitButton from './digit-button';
import OperationButton from './operation-button';

export interface NumpadProps {
	initialValue?: string;
	calculator?: boolean;
	onChange?: (value: string) => void;
}

export const Numpad = ({ initialValue = '0', calculator = false, onChange }: NumpadProps) => {
	const [{ currentOperand, previousOperand, operation }, dispatch] = React.useReducer(reducer, {
		currentOperand: initialValue,
	});

	const handleBackspace = React.useCallback(() => {
		dispatch({ type: ACTIONS.DELETE_DIGIT, payload: undefined });
	}, [dispatch]);

	const handleClear = React.useCallback(() => {
		dispatch({ type: ACTIONS.CLEAR, payload: undefined });
	}, [dispatch]);

	const handleEvaluate = React.useCallback(() => {
		dispatch({ type: ACTIONS.EVALUATE, payload: undefined });
	}, [dispatch]);

	React.useEffect(() => {
		if (onChange) {
			onChange(currentOperand);
		}
	}, [currentOperand, onChange]);

	// detect keyboard for web
	const digitPress = useAllKeysPress({ userKeys: '1' });
	React.useEffect(() => {
		if (digitPress) {
			dispatch({ type: ACTIONS.ADD_DIGIT, payload: { digit: '1' } });
		}
	}, [digitPress]);

	return (
		<Box>
			<Box horizontal>
				<Box fill>
					{calculator && previousOperand && (
						<Box>
							<Text>
								{formatOperand(previousOperand)} {operation}
							</Text>
						</Box>
					)}
					<Box>
						<Text>{formatOperand(currentOperand)}</Text>
					</Box>
				</Box>
				<Icon name="deleteLeft" onPress={handleBackspace} />
			</Box>
			<Box horizontal>
				<Box>
					<Box horizontal padding="xxSmall" space="xxSmall">
						<DigitButton digit="1" dispatch={dispatch} />
						<DigitButton digit="2" dispatch={dispatch} />
						<DigitButton digit="3" dispatch={dispatch} />
					</Box>
					<Box horizontal padding="xxSmall" space="xxSmall">
						<DigitButton digit="4" dispatch={dispatch} />
						<DigitButton digit="5" dispatch={dispatch} />
						<DigitButton digit="6" dispatch={dispatch} />
					</Box>
					<Box horizontal padding="xxSmall" space="xxSmall">
						<DigitButton digit="7" dispatch={dispatch} />
						<DigitButton digit="8" dispatch={dispatch} />
						<DigitButton digit="9" dispatch={dispatch} />
					</Box>
					<Box horizontal padding="xxSmall" space="xxSmall">
						<OperationButton operation="+/-" dispatch={dispatch} />
						<DigitButton digit="0" dispatch={dispatch} />
						<DigitButton digit="." dispatch={dispatch} />
					</Box>
				</Box>
				{calculator && (
					<Box padding="xxSmall" space="xSmall">
						<OperationButton operation="÷" dispatch={dispatch} />
						<OperationButton operation="*" dispatch={dispatch} />
						<OperationButton operation="+" dispatch={dispatch} />
						<OperationButton operation="-" dispatch={dispatch} />
					</Box>
				)}
			</Box>
			{calculator && (
				<Box horizontal padding="xxSmall" space="xSmall">
					<Button title="Clear" onPress={handleClear} />
					<Button onPress={handleEvaluate}>
						<Icon name="equals" size="xSmall" />
					</Button>
				</Box>
			)}
		</Box>
	);
};
