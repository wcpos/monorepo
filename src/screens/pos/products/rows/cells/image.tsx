import * as React from 'react';
import { Image as RNImage, View } from 'react-native';
// import Img from '@wcpos/common/src/components/image';
import Skeleton from '@wcpos/common/src/components/skeleton';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Image = ({ item: product }: Props) => {
	const { thumbnail } = product;
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
					// placeholder={<Img source={require('@wcpos/common/src/assets/placeholder.png')} />}
				/>
			) : (
				<Skeleton style={{ width: size.width, height: size.width }} />
			)}
		</View>
	);
};

export default Image;
