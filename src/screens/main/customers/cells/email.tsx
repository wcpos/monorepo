import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';
type CustomerEmailProps = {
	item: import('@wcpos/database').CustomerDocument;
};

const CustomerEmail = ({ item: customer }: CustomerEmailProps) => {
	const email = useObservableEagerState(customer.email$);

	return <Text numberOfLines={1}>{email}</Text>;
};

export default CustomerEmail;
