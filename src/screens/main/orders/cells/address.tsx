import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Format from '@wcpos/components/src/format';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').OrderDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps;
};

const Address = ({ item: order, column }: Props) => {
	const address = useObservableEagerState(order[`${column.key}$`]);

	return address ? <Format.Address address={address} showName={false} /> : <Text.Skeleton />;
};

export default Address;
