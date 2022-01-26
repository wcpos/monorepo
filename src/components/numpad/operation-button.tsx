import * as React from 'react';
import Button from '../button';
import Icon from '../icon';
import { ACTIONS } from './reducer';

interface OperationButtonProps {
	dispatch: any;
	operation: string;
}

const iconMap = {
	'+/-': 'plusMinus',
	'%': 'percent',
	'+': 'plus',
	'-': 'minus',
	'*': 'xmark',
	'÷': 'divide',
};

const OperationButton = ({ dispatch, operation }: OperationButtonProps) => {
	const handlePress = React.useCallback(() => {
		dispatch({ type: ACTIONS.CHOOSE_OPERATION, payload: { operation } });
	}, [operation, dispatch]);

	return (
		<Button onPress={handlePress}>
			<Icon name={iconMap[operation]} size="xSmall" />
		</Button>
	);
};

export default OperationButton;
