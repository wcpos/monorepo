import * as React from 'react';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Email = ({ item: customer }: Props) => {
	return customer.email !== undefined ? <Text>{customer.email}</Text> : <Text.Skeleton />;
};

export default Email;
