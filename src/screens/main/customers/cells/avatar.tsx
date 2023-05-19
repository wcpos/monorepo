import * as React from 'react';
import { View } from 'react-native';

import min from 'lodash/min';
import { useObservableState } from 'observable-hooks';

import Image from '@wcpos/components/src/image';

type AvatarProps = {
	item: import('@wcpos/database').CustomerDocument;
};

const Avatar = ({ item: customer, cellWidth }: AvatarProps) => {
	const avatar_url = useObservableState(customer.avatar_url$, customer.avatar_url);
	const width = min([cellWidth - 16, 100]);

	return (
		<Image
			source={avatar_url}
			style={{ width, height: width, aspectRatio: 1 }}
			border="rounded"
			recyclingKey={customer.uuid}
			// placeholder={<Img source={require('assets/placeholder.png')} />}
		/>
	);
};

export default Avatar;
