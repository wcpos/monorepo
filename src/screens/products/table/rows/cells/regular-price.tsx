import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

interface Props {
	regularPrice: string;
}

const RegularPrice = ({ regularPrice }: Props) => {
	return <Text>{regularPrice}</Text>;
};

export default RegularPrice;
