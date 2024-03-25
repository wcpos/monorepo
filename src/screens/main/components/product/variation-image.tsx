import * as React from 'react';

import get from 'lodash/get';
import min from 'lodash/min';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Image from '@wcpos/components/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type Props = {
	item: import('@wcpos/database').ProductVariationDocument;
	cellWidth: number;
};

export const ProductVariationImage = ({ item: product, cellWidth }: Props) => {
	const image = useObservableState(product.image$, product.image);
	const imageURL = get(image, 'src', undefined);
	const source = useImageAttachment(product, imageURL);

	return (
		<Box style={{ paddingLeft: '25%', width: '100%', height: '100%' }}>
			<Image
				source={source}
				style={[
					{
						aspectRatio: 1,
						width: '100%',
						height: '100%',
						maxWidth: 60,
						maxHeight: 60,
					},
				]}
				border="rounded"
				recyclingKey={product.uuid}
				// transition={1000}
				// placeholder={<Skeleton width={measurements.width} height={measurements.height} />}
			/>
		</Box>
	);
};
