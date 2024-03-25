import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Image from '@wcpos/components/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type Props = {
	item: import('@wcpos/database').ProductDocument;
	cellWidth: number;
};

export const ProductImage = ({ item: product, cellWidth }: Props) => {
	const images = useObservableState(product.images$, product.images);
	const imageURL = get(images, [0, 'src'], undefined);
	const source = useImageAttachment(product, imageURL);

	return (
		<Image
			source={source}
			style={[
				{
					aspectRatio: 1,
					width: '100%',
					height: '100%',
					maxWidth: 100,
					maxHeight: 100,
				},
			]}
			border="rounded"
			recyclingKey={product.uuid}
			// transition={1000}
			// placeholder={<Skeleton width={measurements.width} height={measurements.height} />}
		/>
	);
};
