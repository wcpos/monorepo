import * as React from 'react';

import get from 'lodash/get';

import { Image } from '@wcpos/components/image';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../components/product/product-image-placeholder';

// An image that is already on screen and only changing place does not fade in again.
const STILL = { transition: 0 };

function TileImageInner({
	record,
	imageUrl,
	still,
}: {
	record: EngineRecord<'products'>;
	imageUrl: string;
	still?: boolean;
}) {
	const { uri, error } = useImageAttachment(record, imageUrl);
	const imageSource = !uri || error ? { uri: PRODUCT_IMAGE_PLACEHOLDER } : { uri };

	return (
		<Image
			source={imageSource}
			recyclingKey={record.uuid}
			className="h-full w-full"
			{...(still ? STILL : {})}
		/>
	);
}

/**
 * Product image for the grid tiles. The image attachment hook suspends while
 * the image loads, so it lives behind its own Suspense boundary to keep the
 * rest of the tile visible.
 */
export function TileImage({
	record,
	still,
}: {
	record: EngineRecord<'products'>;
	still?: boolean;
}) {
	const images = useRecordField(record, (productRecord) => productRecord.payload.images);
	const imageUrl = get(images, [0, 'src'], '') as string;

	return (
		<Suspense
			fallback={
				<Image source={{ uri: undefined }} recyclingKey={record.uuid} className="h-full w-full" />
			}
		>
			<TileImageInner record={record} imageUrl={imageUrl} still={still} />
		</Suspense>
	);
}
