import * as React from 'react';
import Icon from '../icon';
import Box from '../box';
import Text from '../text';
import { reducer, formatOperand } from './reducer';
import DigitButton from './digit-button';
import OperationButton from './operation-button';

export interface NumpadProps {
	initialValue?: string;
	calculator?: boolean;
}

export const Numpad = ({ initialValue = '0', calculator = false }: NumpadProps) => {
	const [{ currentOperand, previousOperand, operation }, dispatch] = React.useReducer(reducer, {
		currentOperand: initialValue,
	});

	return (
		<Box>
			{calculator && (
				<Box>
					<Text>
						{formatOperand(previousOperand)} {operation}
					</Text>
				</Box>
			)}
			<Box>
				<Text>{formatOperand(currentOperand)}</Text>
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
		</Box>
	);
};
