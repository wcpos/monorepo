import * as React from 'react';
import Button from '../button';
import { ACTIONS } from './reducer';

interface OperationButtonProps {
	dispatch: any;
	operation: string;
}

const OperationButton = ({ dispatch, operation }: OperationButtonProps) => {
	const handlePress = React.useCallback(() => {
		dispatch({ type: ACTIONS.CHOOSE_OPERATION, payload: { operation } });
	}, [operation, dispatch]);

	return <Button title={operation} onPress={handlePress} />;
};

export default OperationButton;
