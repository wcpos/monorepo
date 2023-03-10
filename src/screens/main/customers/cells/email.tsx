import * as React from 'react';

import Text from '@wcpos/components/src/text';
type CustomerEmailProps = {
	item: import('@wcpos/database').CustomerDocument;
};

const CustomerEmail = ({ item: customer }: CustomerEmailProps) => {
	return <Text numberOfLines={1}>{customer.email}</Text>;
};

export default CustomerEmail;
