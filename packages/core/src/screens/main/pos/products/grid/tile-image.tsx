import * as React from 'react';

import get from 'lodash/get';

import { Image } from '@wcpos/components/image';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../components/product/product-image-placeholder';
import { probeEvent, useMountProbe, useRenderProbe } from '../render-probe';
import { useCopyPicture } from '../v2/deal-stack';

// An image that is already on screen and only changing place does not fade in again.
const STILL = { transition: 0 };
// The Poster tile's picture is the whole square.
const COVER = { contentFit: 'cover' } as const;

function TileImageInner({
	record,
	imageUrl,
	still,
	cover,
	onFailed,
}: {
	record: EngineRecord<'products'>;
	imageUrl: string;
	still?: boolean;
	cover?: boolean;
	onFailed?: () => void;
}) {
	const { uri, error } = useImageAttachment(record, imageUrl);
	const failed = !uri || !!error;
	// Before the paint: a tile that falls back never shows the placeholder for a frame.
	React.useLayoutEffect(() => {
		if (failed) onFailed?.();
	}, [failed, uri, onFailed]);
	const imageSource = failed ? { uri: PRODUCT_IMAGE_PLACEHOLDER } : { uri };
	// On a dealt parent's copy, the copy waits for this picture to paint (deal-stack.tsx).
	const painted = useCopyPicture();
	// Troubleshooting probe (render-probe.ts): a changed `uri` is a new <img> and a new fade.
	useRenderProbe('TileImageInner', record.uuid, {
		record,
		imageUrl,
		uri,
		error,
		errorMessage: error ? String(error) : null,
		still,
		painted,
	});
	const id = record.remoteId ?? record.uuid;

	return (
		<Image
			source={imageSource}
			recyclingKey={record.uuid}
			className="h-full w-full"
			onLoadStart={() => probeEvent('image.loadStart', {}, id)}
			onLoad={(event) => probeEvent('image.load', { cacheType: event?.cacheType ?? 'unknown' }, id)}
			onDisplay={() => {
				probeEvent('image.display', {}, id);
				painted?.();
			}}
			onError={() => {
				probeEvent('image.error', {}, id);
				painted?.();
				onFailed?.();
			}}
			{...(still ? STILL : {})}
			{...(cover ? COVER : {})}
		/>
	);
}

/** The fallback is a blank image; its mount means the real one suspended (a new resource). */
function TileImageFallback({ record }: { record: EngineRecord<'products'> }) {
	useMountProbe('image.suspended', record.remoteId ?? record.uuid);
	return <Image source={{ uri: undefined }} recyclingKey={record.uuid} className="h-full w-full" />;
}

/**
 * Product image for the grid tiles. The image attachment hook suspends while
 * the image loads, so it lives behind its own Suspense boundary to keep the
 * rest of the tile visible.
 */
export function TileImage({
	record,
	still,
	cover,
	onFailed,
}: {
	record: EngineRecord<'products'>;
	still?: boolean;
	/** Fill the square (the Poster tile) rather than fit inside it. */
	cover?: boolean;
	/** No picture, or it failed: the Poster tile shows a tint instead of the placeholder. */
	onFailed?: () => void;
}) {
	const images = useRecordField(record, (productRecord) => productRecord.payload.images);
	const imageUrl = get(images, [0, 'src'], '') as string;
	useRenderProbe('TileImage', record.uuid, { record, images, imageUrl, still });

	return (
		<Suspense fallback={<TileImageFallback record={record} />}>
			<TileImageInner
				record={record}
				imageUrl={imageUrl}
				still={still}
				cover={cover}
				onFailed={onFailed}
			/>
		</Suspense>
	);
}
