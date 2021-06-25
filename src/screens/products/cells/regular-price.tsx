import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').CustomerDocument;
};

const RegularPrice = ({ item: product }: Props) => {
	return <Text>{product.regularPrice}</Text>;
};

export default RegularPrice;
