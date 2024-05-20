import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

/**
 *
 */
export const Cashier = ({ item: order }: Props) => {
	const cashierID = useObservableEagerState(
		order.meta_data$.pipe(
			map((meta) => meta.find((m) => m.key === '_pos_user')),
			map((m) => m?.value)
		)
	);

	return <Text>{cashierID}</Text>;
};
