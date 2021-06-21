import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	customer: import('@wcpos/common/src/database').CustomerDocument;
	type: 'firstName' | 'lastName';
};

const Name = ({ customer, type }: Props) => {
	const name = customer[type];

	return name !== undefined ? <Text>{name}</Text> : <Text.Skeleton />;
};

export default Name;
