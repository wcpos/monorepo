import * as React from 'react';

import { Action, ACTIONS, CalculatorState, Config, reducer } from './reducer';

export interface UseCalculatorProps {
	initialValue?: string;
	decimalSeparator?: string;
	precision?: number;
}

export const useCalculator = ({
	initialValue = '0',
	decimalSeparator = '.',
	precision = 6,
}: UseCalculatorProps) => {
	const reducerConfig = React.useMemo<Config>(
		() => ({
			decimalSeparator,
			precision,
		}),
		[decimalSeparator, precision]
	);

	const [{ currentOperand, previousOperand, operation }, dispatch] = React.useReducer(
		(state: CalculatorState, action: Action) => reducer(state, action, reducerConfig),
		{
			currentOperand: initialValue,
			previousOperand: '0',
			operation: '',
		}
	);

	const addDigit = React.useCallback((digit: string, overwrite: boolean) => {
		dispatch({
			type: ACTIONS.ADD_DIGIT,
			payload: { digit, overwrite },
		});
	}, []);

	const chooseOperation = React.useCallback((operation: string) => {
		dispatch({ type: ACTIONS.CHOOSE_OPERATION, payload: { operation } });
	}, []);

	const deleteDigit = React.useCallback(() => {
		dispatch({ type: ACTIONS.DELETE_DIGIT });
	}, []);

	const clear = React.useCallback(() => {
		dispatch({ type: ACTIONS.CLEAR });
	}, []);

	const evaluateOperation = React.useCallback(() => {
		dispatch({ type: ACTIONS.EVALUATE });
	}, []);

	const switchSign = React.useCallback(() => {
		dispatch({ type: ACTIONS.SWITCH_SIGN });
	}, []);

	const applyDiscount = React.useCallback((discount: number) => {
		dispatch({
			type: ACTIONS.APPLY_DISCOUNT,
			payload: { discount },
		});
	}, []);

	return {
		currentOperand,
		previousOperand,
		operation,
		addDigit,
		chooseOperation,
		deleteDigit,
		clear,
		evaluateOperation,
		switchSign,
		applyDiscount,
	};
};
