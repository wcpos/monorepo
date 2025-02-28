import * as React from 'react';

import { useObservable, useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { map, switchMap, filter, tap } from 'rxjs/operators';

type RxDocument = import('rxdb').RxDocument;

async function fetchAndStoreImage(document: RxDocument, imageUrl: string) {
	const response = await fetch(imageUrl);

	// Check if the response is okay
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
	}

	// Check if the content-type is an image
	const contentType = response.headers.get('Content-Type') || '';
	if (!contentType.startsWith('image/')) {
		throw new Error(`Invalid content type: ${contentType}`);
	}

	const blob = await response.blob();

	// Optional: Check if the blob size is greater than 0
	if (blob.size === 0) {
		throw new Error('Fetched blob is empty');
	}

	// Save the blob as an attachment
	await document.putAttachment({
		id: imageUrl,
		data: blob,
		type: blob.type,
	});
}

/**
 * Returns an image blob from the attachment.
 * - also returns the image dimensions
 * - fetches and stores the image blob if it doesn't not exist
 * - imageUrl is used as the attachment id
 */
export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	const blob$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				filter(([document, imageUrl]) => isRxDocument(document) && !!imageUrl),
				switchMap(([document, imageUrl]) =>
					document.allAttachments$.pipe(
						map((attachments: any[]) =>
							attachments.find((attachment) => attachment.id === imageUrl)
						),
						filter((attachment) => {
							if (attachment) {
								return true;
							}
							fetchAndStoreImage(document, imageUrl);
							return false;
						}),
						switchMap((attachment) => attachment?.getData()),
						map((blob) => URL.createObjectURL(blob))
					)
				)
			),
		[document, imageUrl]
	);

	const imageBlobUrl = useObservableState(blob$, undefined);

	/**
	 * We should revoke the object url when the component unmounts
	 *
	 * https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static#usage_notes
	 */
	React.useEffect(() => {
		return () => {
			if (imageBlobUrl) {
				URL.revokeObjectURL(imageBlobUrl);
			}
		};
	}, [imageBlobUrl]);

	return { uri: imageBlobUrl };
};
