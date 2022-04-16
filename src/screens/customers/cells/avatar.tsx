import * as React from 'react';
import { Image as RNImage, View } from 'react-native';
// import Img from '@wcpos/components/src/image';
import Skeleton from '@wcpos/components/src/skeleton';

type AvatarProps = {
	item: import('@wcpos/database').CustomerDocument;
};

const Avatar = ({ item: customer }: AvatarProps) => {
	const [size, setSize] = React.useState({ width: undefined, height: undefined });

	const onLayout = React.useCallback((event) => {
		const { width, height } = event.nativeEvent.layout;
		setSize({ width, height });
	}, []);

	return (
		<View onLayout={onLayout} style={{ width: '100%' }}>
			{customer.avatarUrl ? (
				<RNImage
					source={{ uri: customer.avatarUrl }}
					style={{ width: size.width, height: size.width, aspectRatio: 1 }}
					// placeholder={<Img source={require('@wcpos/common/src/assets/placeholder.png')} />}
				/>
			) : (
				<Skeleton style={{ width: size.width, height: size.width }} />
			)}
		</View>
	);
};

export default Avatar;
