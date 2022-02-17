import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import * as Styled from './styles';

interface ProductFooterProps {
	count: number;
}

const OrdersFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.orders.totalDocCount$, 0);

	return (
		<Styled.Footer>
			<Text>
				{count} of {total}
			</Text>
		</Styled.Footer>
	);
};

export default OrdersFooter;
