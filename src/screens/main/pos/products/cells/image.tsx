import * as React from 'react';
import { Image as RNImage, View } from 'react-native';

import { useObservableState } from 'observable-hooks';

// import Img from '@wcpos/components/src/image';
import Skeleton from '@wcpos/components/src/skeleton';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

export const Image = ({ item: product }: Props) => {
	const thumbnail = useObservableState(product.thumbnail$, product.thumbnail);
	const [size, setSize] = React.useState({ width: undefined, height: undefined });

	const onLayout = React.useCallback((event) => {
		const { width, height } = event.nativeEvent.layout;
		setSize({ width, height });
	}, []);

	return (
		<View onLayout={onLayout} style={{ width: '100%' }}>
			{thumbnail ? (
				<RNImage
					source={{ uri: thumbnail }}
					style={{ width: size.width, height: size.width, aspectRatio: 1 }}
					// placeholder={<Img source={require('assets/placeholder.png')} />}
				/>
			) : (
				<Skeleton style={{ width: size.width, height: size.width }} />
			)}
		</View>
	);
};

export default Image;
