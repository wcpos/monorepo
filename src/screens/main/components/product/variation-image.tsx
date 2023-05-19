import * as React from 'react';

import get from 'lodash/get';
import min from 'lodash/min';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Image from '@wcpos/components/src/image';

type Props = {
	item: import('@wcpos/database').ProductVariationDocument;
};

export const ProductVariationImage = ({ item: product, cellWidth }: Props) => {
	const image = useObservableState(product.image$, product.image);
	const source = get(image, 'src', undefined);
	const width = min([(cellWidth - 16) * 0.75, 75]);

	return (
		<Box style={{ paddingLeft: '25%' }}>
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
		</Box>
	);
};
