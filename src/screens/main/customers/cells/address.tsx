import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormatAddress } from '@wcpos/tailwind/src/format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps;
};

const Address = ({ item: customer, column }: Props) => {
	const address = useObservableEagerState(customer[`${column.key}$`]);

	return <FormatAddress address={address} showName={true} />;
};

export default Address;
