import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { defer, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { useHttpClient } from '@wcpos/hooks/use-http-client';

type RxDocument = import('rxdb').RxDocument;
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

async function fetchImageBlob(document: RxDocument, imageUrl: string, get: HttpGet): Promise<Blob> {
	// First, check if we already have this attachment
	const existingAttachment = document.getAttachment(imageUrl);
	if (existingAttachment) {
		return existingAttachment.getData();
	}

	// If not, fetch and store it
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

	// Store the attachment so the image is available offline
	await document.putAttachment({
		id: imageUrl,
		data: blob,
		type: blob.type,
	});

	return blob;
}

function getImageResource(document: RxDocument, imageUrl: string, get: HttpGet): ImageResource {
	let resource = imageResourceCache.get(imageUrl);
	if (!resource) {
		const state$ = defer(() => fetchImageBlob(document, imageUrl, get)).pipe(
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
 * Resolves an image URL to a local object URL backed by an RxDB attachment,
 * suspending until the image is available. Callers must have a Suspense
 * boundary above them. Errors are returned as state, not thrown, so callers
 * can fall back to a placeholder.
 */
export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	const { get } = useHttpClient();
	const hasValidSource = isRxDocument(document) && !!imageUrl;

	// Memoized so a re-render of a mounted component keeps its (possibly
	// errored) resource; only a fresh mount or a source change retries.
	const resource = React.useMemo(
		() => (hasValidSource ? getImageResource(document, imageUrl, get) : emptyResource),
		[document, imageUrl, get, hasValidSource]
	);

	return useObservableSuspense(resource);
};
