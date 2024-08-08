import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/tailwind/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type AvatarProps = {
	item: import('@wcpos/database').CustomerDocument;
	cellWidth: number;
};

/**
 *
 */
const Avatar = ({ item: customer, cellWidth }: AvatarProps) => {
	const avatarUrl = useObservableEagerState(customer.avatar_url$);
	const source = useImageAttachment(customer, avatarUrl);

	return <Image source={source} className="w-10 h-10 rounded" recyclingKey={customer.uuid} />;
};

export default Avatar;
