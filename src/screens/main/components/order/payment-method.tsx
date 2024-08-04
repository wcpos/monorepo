import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const PaymentMethod = ({ item }: Props) => {
	// const paymentMethod = useObservableEagerState(item.payment_method$);
	const paymentMethodTitle = useObservableEagerState(item.payment_method_title$);

	return paymentMethodTitle ? <Text>{paymentMethodTitle}</Text> : null;
};

export default PaymentMethod;
