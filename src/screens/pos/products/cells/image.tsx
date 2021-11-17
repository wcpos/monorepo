import * as React from 'react';
import { Image as RNImage } from 'react-native';
// import Img from '@wcpos/common/src/components/image';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Image = ({ item: product }: Props) => {
	const { thumbnail } = product;

	return (
		<RNImage
			source={{ uri: thumbnail }}
			style={{ width: '100%', height: undefined, aspectRatio: 1 }}
			// placeholder={<Img source={require('@wcpos/common/src/assets/placeholder.png')} />}
		/>
	);
};

export default Image;
