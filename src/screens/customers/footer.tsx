import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/components/src/button';
import Text from '@wcpos/components/src/text';
import useAppState from '@wcpos/hooks/src/use-app-state';
import * as Styled from './styles';

interface CustomersFooterProps {
	count: number;
}

const CustomersFooter = ({ count }: CustomersFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.customers.totalDocCount$, 0);

	return (
		<Styled.Footer>
			<Text>
				{count} of {total}
			</Text>
		</Styled.Footer>
	);
};

export default CustomersFooter;
