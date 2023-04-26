import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Image from '@wcpos/components/src/image';
import Skeleton from '@wcpos/components/src/skeleton';
import useMeasure from '@wcpos/hooks/src/use-measure';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

export const ProductImage = ({ item: product }: Props) => {
	const images = useObservableState(product.images$, product.images);
	const source = get(images, [0, 'src'], undefined);

	const [measurements, onMeasure] = React.useState({
		width: 0,
		height: 0,
		pageX: 0,
		pageY: 0,
		x: 0,
		y: 0,
	});

	// const ref= React.useRef<View>(null);
	const { MeasureWrapper } = useMeasure({ onMeasure });

	return source ? (
		<MeasureWrapper style={{ width: '100%' }}>
			<Image
				source={source}
				style={{ width: measurements.width, height: measurements.width, aspectRatio: 1 }}
				border="rounded"
				recyclingKey={product.uuid}
				// transition={1000}
				// placeholder={<Skeleton width={measurements.width} height={measurements.height} />}
			/>
		</MeasureWrapper>
	) : (
		<Skeleton width={measurements.width} height={measurements.height} />
	);
};
