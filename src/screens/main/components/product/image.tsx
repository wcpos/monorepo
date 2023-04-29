import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import Image from '@wcpos/components/src/image';
import Skeleton from '@wcpos/components/src/skeleton';
import useMeasure from '@wcpos/hooks/src/use-measure';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

export const ProductImage = ({ item: product }: Props) => {
	const images = useObservableState(product.images$, product.images);
	const source = get(images, [0, 'src'], undefined);
	const { MeasureWrapper, measurements } = useMeasure({
		initialMeasurements: { width: 100, height: 100 },
	});

	const wrapperStyle = useAnimatedStyle(() => ({
		width: measurements.value.width,
		height: measurements.value.width,
	}));

	return source ? (
		<MeasureWrapper style={{ width: '100%' }}>
			<Animated.View style={[wrapperStyle]}>
				<Image
					source={source}
					style={[
						{
							aspectRatio: 1,
							width: '100%',
							height: '100%',
						},
					]}
					border="rounded"
					recyclingKey={product.uuid}
					// transition={1000}
					// placeholder={<Skeleton width={measurements.width} height={measurements.height} />}
				/>
			</Animated.View>
		</MeasureWrapper>
	) : (
		<Skeleton width={measurements.value.width} height={measurements.value.height} />
	);
};
