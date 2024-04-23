import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Image from '@wcpos/components/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type AvatarProps = {
	item: import('@wcpos/database').CustomerDocument;
	cellWidth: number;
};

const Avatar = ({ item: customer, cellWidth }: AvatarProps) => {
	const avatarUrl = useObservableEagerState(customer.avatar_url$);
	const source = useImageAttachment(customer, avatarUrl);

	return (
		<Image
			source={source}
			style={[
				{
					aspectRatio: 1,
					width: '100%',
					height: '100%',
					maxWidth: 100,
					maxHeight: 100,
				},
			]}
			border="rounded"
			recyclingKey={customer.uuid}
			// placeholder={<Img source={require('assets/placeholder.png')} />}
		/>
	);
};

export default Avatar;
