import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import Box from '@wcpos/common/src/components/box';
import useCurrencyFormat from '@wcpos/common/src/hooks/use-currency-format';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const Totals = ({ order }: Props) => {
	const total = useObservableState(order.total$, order.total);
	const totalTax = useObservableState(order.total_tax$, order.total_tax);
	const { format } = useCurrencyFormat();

	return (
		<>
			<Box horizontal>
				<Box fill padding="small">
					<Text>Total Tax:</Text>
				</Box>
				<Box padding="small">
					<Text>{format(totalTax || 0)}</Text>
				</Box>
			</Box>
			<Box horizontal>
				<Box fill padding="small">
					<Text>Order Total:</Text>
				</Box>
				<Box padding="small">
					<Text>{format(total || 0)}</Text>
				</Box>
			</Box>
		</>
	);
};

export default Totals;
