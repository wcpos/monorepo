import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import min from 'lodash/min';
import { useObservableState } from 'observable-hooks';

import Image from '@wcpos/components/src/image';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

export const ProductImage = ({ item: product, cellWidth }: Props) => {
	const images = useObservableState(product.images$, product.images);
	const source = get(images, [0, 'src'], undefined);
	const width = min([cellWidth - 16, 100]);

	return (
		<Image
			source={source}
			style={[
				{
					aspectRatio: 1,
					width,
					height: width,
				},
			]}
			border="rounded"
			recyclingKey={product.uuid}
			// transition={1000}
			// placeholder={<Skeleton width={measurements.width} height={measurements.height} />}
		/>
	);
};
