import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').OrderDocument;
	column: import('../../contexts/ui-settings').UISettingsColumn;
};

const PaymentMethod = ({ item, column }: Props) => {
	const paymentMethod = useObservableState(item.payment_method$, item.payment_method);
	const paymentMethodTitle = useObservableState(
		item.payment_method_title$,
		item.payment_method_title
	);

	return paymentMethodTitle ? <Text>{paymentMethodTitle}</Text> : null;
};

export default PaymentMethod;
