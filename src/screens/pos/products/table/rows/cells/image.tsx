import * as React from 'react';
import Img from '@wcpos/common/src/components/image3';
import get from 'lodash/get';

type Props = {
	product: import('@wcpos/common/src/database').ProductDocument;
};

const Image = ({ product }: Props) => {
	const src = get(product, 'images.0.src');

	return (
		<Img
			src={src}
			// placeholder={<Img source={require('@wcpos/common/src/assets/placeholder.png')} />}
		/>
	);
};

export default Image;
