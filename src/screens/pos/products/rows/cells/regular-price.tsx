import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const RegularPrice = ({ item: product }: Props) => {
	return <Text>{product.regular_price}</Text>;
};

export default RegularPrice;
