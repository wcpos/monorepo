import * as React from 'react';

import Format from '@wcpos/components/src/format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
	column: import('@wcpos/components/src/table').ColumnProps;
};

const Address = ({ item: customer, column }: Props) => {
	return <Format.Address address={customer[column.key]} showName={false} />;
};

export default Address;
