import * as React from 'react';
import Format from '@wcpos/common/src/components/format';

type Props = {
	item: import('@wcpos/common/src/database').CustomerDocument;
	column: import('@wcpos/common/src/components/table/types').ColumnProps;
};

const Address = ({ item: customer, column }: Props) => {
	return <Format.Address address={customer[column.key]} showName={false} />;
};

export default Address;
