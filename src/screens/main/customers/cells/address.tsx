import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Format from '@wcpos/components/src/format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
	column: import('@wcpos/components/src/table').ColumnProps;
};

const Address = ({ item: customer, column }: Props) => {
	const address = useObservableState(customer[`${column.key}$`], customer[column.key]);

	return <Format.Address address={address} showName={false} />;
};

export default Address;
