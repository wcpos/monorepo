import React from 'react';
import { Wrapper, TotalText } from './styles';
import useObservable from '../../../../hooks/use-observable';

interface Props {
	order: any;
}

const Totals = ({ order }: Props) => {
	// const items = useObservable(order.line_items.observeWithColumns(['quantity', 'total']));

	// const total =
	// 	items &&
	// 	items.reduce((result: any, line_item: any) => {
	// 		result += line_item.calculatedTotal;
	// 		return result;
	// 	}, 0);

	return (
		<Wrapper>
			<TotalText>Order Total: {order.total}</TotalText>
			<TotalText>Calc Total: </TotalText>
		</Wrapper>
	);
};

export default Totals;
