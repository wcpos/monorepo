import * as React from 'react';
import Format from '@wcpos/common/src/components/format';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').OrderDocument;
	column: import('@wcpos/common/src/components/table/types').ColumnProps;
};

const Address = ({ item: order, column }: Props) => {
	const address = order[column.key];

	return address ? <Format.Address address={address} showName={false} /> : <Text.Skeleton />;
};

export default Address;
