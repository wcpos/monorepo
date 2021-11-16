import * as React from 'react';
import Img from '@wcpos/common/src/components/image';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Image = ({ item: product }: Props) => {
	const { thumbnail } = product;
	return null;
	return (
		<Img
			src={thumbnail}
			// placeholder={<Img source={require('@wcpos/common/src/assets/placeholder.png')} />}
		/>
	);
};

export default Image;
