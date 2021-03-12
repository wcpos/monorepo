import * as React from 'react';
import Text from '../../../../components/text';

type Props = {
	product: Product;
};

const RegularPrice = ({ product }: Props) => {
	return <Text>{product.regular_price}</Text>;
};

export default RegularPrice;
