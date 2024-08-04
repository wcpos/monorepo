import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormatAddress } from '@wcpos/tailwind/src/format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps;
};

export const Address = ({ item: order, column }: Props) => {
	const address = useObservableEagerState(order[`${column.key}$`]);

	return address ? <FormatAddress address={address} showName={false} /> : null;
};
