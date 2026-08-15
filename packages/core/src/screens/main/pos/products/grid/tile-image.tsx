import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/image';
import { Suspense } from '@wcpos/components/suspense';

import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../components/product/product-image-placeholder';

type ProductDocument = import('@wcpos/database').ProductDocument;

function TileImageInner({ product, imageUrl }: { product: ProductDocument; imageUrl: string }) {
	const { uri, error } = useImageAttachment(product, imageUrl);
	const imageSource = !uri || error ? { uri: PRODUCT_IMAGE_PLACEHOLDER } : { uri };

	return <Image source={imageSource} recyclingKey={product.uuid} className="h-full w-full" />;
}

/**
 * Product image for the grid tiles. The image attachment hook suspends while
 * the image loads, so it lives behind its own Suspense boundary to keep the
 * rest of the tile visible.
 */
export function TileImage({ product }: { product: ProductDocument }) {
	const images = useObservableEagerState(product.images$!);
	const imageUrl = get(images, [0, 'src'], '') as string;

	return (
		<Suspense
			fallback={
				<Image source={{ uri: undefined }} recyclingKey={product.uuid} className="h-full w-full" />
			}
		>
			<TileImageInner product={product} imageUrl={imageUrl} />
		</Suspense>
	);
}
