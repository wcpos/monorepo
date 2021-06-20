import * as React from 'react';
import Format from '@wcpos/common/src/components/format';
import Text from '@wcpos/common/src/components/text';

type Props = {
	order: import('@wcpos/common/src/database').OrderDocument;
	type: 'shipping' | 'billing';
};

const Address = ({ order, type }: Props) => {
	const address = order[type];

	return address ? <Format.Address address={address} showName={false} /> : <Text.Skeleton />;
};

export default Address;
