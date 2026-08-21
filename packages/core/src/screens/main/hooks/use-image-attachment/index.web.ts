import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { defer, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { useHttpClient } from '@wcpos/hooks/use-http-client';

import type { ImageAttachmentSource } from './types';
type HttpGet = ReturnType<typeof useHttpClient>['get'];

export interface ImageAttachmentState {
	uri: string | undefined;
	error: Error | null;
}

type ImageResource = ObservableResource<ImageAttachmentState>;

/**
 * One resource per image URL, shared by every component that displays it and
 * kept for the session. Each URL loads at most once, late subscribers get the
 * cached value synchronously, and a slow load can only ever resolve into its
 * own slot — it can never overwrite another image. The object URLs are kept
 * alive for cache hits; the set is bounded by the distinct images viewed.
 */
const imageResourceCache = new Map<string, ImageResource>();

const EMPTY_STATE: ImageAttachmentState = { uri: undefined, error: null };
const emptyResource: ImageResource = new ObservableResource(of(EMPTY_STATE));

export const ERROR_RETRY_DELAY_MS = 30_000;

async function fetchImageBlob(
	_source: ImageAttachmentSource,
	imageUrl: string,
	get: HttpGet
): Promise<Blob> {
	let cache: Cache | undefined;
	if (typeof caches !== 'undefined') {
		try {
			cache = await caches.open('wcpos-images-v1');
			const cachedResponse = await cache.match(imageUrl);
			if (cachedResponse) {
				return cachedResponse.blob();
			}
		} catch {
			cache = undefined;
		}
	}

	// wcposHeaders: false prevents X-WCPOS header which triggers CORS preflight on external URLs
	// @ts-expect-error: wcposHeaders is a custom config option from our axios interceptor
	const response = await get(imageUrl, { responseType: 'arraybuffer', wcposHeaders: false });

	if (!response || response.status !== 200) {
		throw new Error(`Failed to fetch image: ${response?.status} ${response?.statusText}`);
	}

	const contentType = String(response.headers['content-type'] ?? '');
	if (!contentType.startsWith('image/')) {
		throw new Error(`Invalid content type: ${contentType}`);
	}

	const blob = new Blob([response.data], { type: contentType });
	if (blob.size === 0) {
		throw new Error('Fetched blob is empty');
	}

	if (cache) {
		try {
			await cache.put(imageUrl, new Response(blob, { headers: { 'content-type': blob.type } }));
		} catch {
			// Browser storage may be unavailable or over quota; the fetched image is still usable.
		}
	}

	return blob;
}

function getImageResource(
	source: ImageAttachmentSource,
	imageUrl: string,
	get: HttpGet
): ImageResource {
	let resource = imageResourceCache.get(imageUrl);
	if (!resource) {
		const state$ = defer(() => fetchImageBlob(source, imageUrl, get)).pipe(
			map((blob): ImageAttachmentState => ({ uri: URL.createObjectURL(blob), error: null })),
			catchError((err) => {
				// Keep the errored resource cached: a Suspense retry re-renders with
				// an uncommitted useMemo, so immediate eviction would refetch in a
				// tight loop. Evict after a delay so a later mount can retry.
				setTimeout(() => {
					imageResourceCache.delete(imageUrl);
				}, ERROR_RETRY_DELAY_MS);
				const error = err instanceof Error ? err : new Error('Unknown error');
				return of({ uri: undefined, error });
			})
		);
		resource = new ObservableResource(state$);
		imageResourceCache.set(imageUrl, resource);
	}
	return resource;
}

/**
 * Resolves an image URL to a local object URL backed by the browser Cache API,
 * suspending until the image is available. Callers must have a Suspense
 * boundary above them. Errors are returned as state, not thrown, so callers
 * can fall back to a placeholder.
 */
export const useImageAttachment = (source: ImageAttachmentSource, imageUrl: string) => {
	const { get } = useHttpClient();
	const hasValidSource = !!imageUrl;

	// Memoized so a re-render of a mounted component keeps its (possibly
	// errored) resource; only a fresh mount or a source change retries.
	const resource = React.useMemo(
		() => (hasValidSource ? getImageResource(source, imageUrl, get) : emptyResource),
		[source, imageUrl, get, hasValidSource]
	);

	return useObservableSuspense(resource);
};
