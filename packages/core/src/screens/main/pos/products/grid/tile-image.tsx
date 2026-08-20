import * as React from 'react';

import get from 'lodash/get';

import { Image } from '@wcpos/components/image';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../components/product/product-image-placeholder';

function TileImageInner({
	record,
	imageUrl,
}: {
	record: EngineRecord<'products'>;
	imageUrl: string;
}) {
	const { uri, error } = useImageAttachment(record, imageUrl);
	const imageSource = !uri || error ? { uri: PRODUCT_IMAGE_PLACEHOLDER } : { uri };

	return <Image source={imageSource} recyclingKey={record.uuid} className="h-full w-full" />;
}

/**
 * Product image for the grid tiles. The image attachment hook suspends while
 * the image loads, so it lives behind its own Suspense boundary to keep the
 * rest of the tile visible.
 */
export function TileImage({ record }: { record: EngineRecord<'products'> }) {
	const images = useRecordField(record, (productRecord) => productRecord.payload.images);
	const imageUrl = get(images, [0, 'src'], '') as string;

	return (
		<Suspense
			fallback={
				<Image source={{ uri: undefined }} recyclingKey={record.uuid} className="h-full w-full" />
			}
		>
			<TileImageInner record={record} imageUrl={imageUrl} />
		</Suspense>
	);
}
