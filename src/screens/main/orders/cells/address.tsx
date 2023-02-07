import * as React from 'react';

import Format from '@wcpos/components/src/format';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').OrderDocument;
	column: import('@wcpos/components/src/table').ColumnProps;
};

const Address = ({ item: order, column }: Props) => {
	const address = order[column.key];

	return address ? <Format.Address address={address} showName={false} /> : <Text.Skeleton />;
};

export default Address;
