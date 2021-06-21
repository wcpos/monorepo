import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	customer: import('@wcpos/common/src/database').CustomerDocument;
};

const Email = ({ customer }: Props) => {
	return customer.email !== undefined ? <Text>{customer.email}</Text> : <Text.Skeleton />;
};

export default Email;
