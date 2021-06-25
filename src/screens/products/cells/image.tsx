import * as React from 'react';
import Img from '@wcpos/common/src/components/image';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Image = ({ item: product }: Props) => {
	return <Img src={product.thumbnail} style={{ width: 100, height: 100 }} />;
};

export default Image;
