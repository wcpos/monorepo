import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';

interface Props {
	item: import('@wcpos/common/src/database').FeeLineDocument;
}

const TotalTax = ({ item }: Props) => {
	const totalTax = useObservableState(item.computedTotalTax$, item.totalTax);

	return <Text>{totalTax}</Text>;
};

export default TotalTax;
