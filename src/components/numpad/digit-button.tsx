import * as React from 'react';
import Button from '../button';
import { ACTIONS } from './reducer';

interface DigitButtonProps {
	dispatch: any;
	digit: string;
}

const DigitButton = ({ dispatch, digit }: DigitButtonProps) => {
	const handlePress = React.useCallback(() => {
		dispatch({ type: ACTIONS.ADD_DIGIT, payload: { digit } });
	}, [digit, dispatch]);

	return <Button title={digit} onPress={handlePress} />;
};

export default DigitButton;
