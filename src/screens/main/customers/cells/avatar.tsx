import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import Image from '@wcpos/components/src/image';
import useMeasure from '@wcpos/hooks/src/use-measure';

type AvatarProps = {
	item: import('@wcpos/database').CustomerDocument;
};

const Avatar = ({ item: customer }: AvatarProps) => {
	const avatar_url = useObservableState(customer.avatar_url$, customer.avatar_url);
	const { MeasureWrapper, measurements } = useMeasure({
		initialMeasurements: { width: 100, height: 100 },
	});

	const wrapperStyle = useAnimatedStyle(() => ({
		width: measurements.value.width,
		height: measurements.value.width,
	}));

	return (
		<MeasureWrapper style={{ width: '100%' }}>
			<Animated.View style={[wrapperStyle]}>
				<Image
					source={avatar_url}
					style={{ width: measurements.width, height: measurements.width, aspectRatio: 1 }}
					border="rounded"
					recyclingKey={customer.uuid}
					// placeholder={<Img source={require('assets/placeholder.png')} />}
				/>
			</Animated.View>
		</MeasureWrapper>
	);
};

export default Avatar;
