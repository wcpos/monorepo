import * as React from 'react';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const RegularPrice = ({ item: product }: Props) => {
	return <Text>{product.regular_price}</Text>;
};

export default RegularPrice;
