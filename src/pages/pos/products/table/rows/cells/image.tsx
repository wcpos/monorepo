import * as React from 'react';
import Img from '../../../../../../components/image';

type Props = {
	product: any;
};

const Image = ({ product }: Props) => {
	return <Img src={product.thumbnail} style={{ width: 100, height: 100 }} />;
};

export default Image;
