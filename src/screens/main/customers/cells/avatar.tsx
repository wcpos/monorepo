import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Image from '@wcpos/components/src/image';
import useMeasure from '@wcpos/hooks/src/use-measure';

type AvatarProps = {
	item: import('@wcpos/database').CustomerDocument;
};

const Avatar = ({ item: customer }: AvatarProps) => {
	const avatar_url = useObservableState(customer.avatar_url$, customer.avatar_url);

	const [measurements, onMeasure] = React.useState({
		width: 50,
		height: 50,
		pageX: 0,
		pageY: 0,
		x: 0,
		y: 0,
	});

	// const ref = React.useRef<View>(null);
	const { MeasureWrapper } = useMeasure({ onMeasure });

	return (
		<MeasureWrapper style={{ width: '100%' }}>
			<Image
				source={avatar_url}
				style={{ width: measurements.width, height: measurements.width, aspectRatio: 1 }}
				border="rounded"
				recyclingKey={customer.uuid}
				// placeholder={<Img source={require('assets/placeholder.png')} />}
			/>
		</MeasureWrapper>
	);
};

export default Avatar;
