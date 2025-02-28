import * as React from 'react';

import { useObservable, useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { map, switchMap, filter } from 'rxjs/operators';

import useHttpClient from '@wcpos/hooks/src/use-http-client';

type RxDocument = import('rxdb').RxDocument;

export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	// Retrieve the HTTP client once from the hook.
	const { get } = useHttpClient();

	// Inline function to fetch and store the image using the main process HTTP client.
	const fetchAndStoreImage = async (doc: RxDocument, url: string) => {
		// Request the image as binary data.
		const response = await get(url, { responseType: 'arraybuffer' });

		if (response && response.status !== 200) {
			throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
		}

		// Validate that the response has an appropriate content type.
		const contentType = response?.headers['content-type'] || '';
		if (!contentType.startsWith('image/')) {
			throw new Error(`Invalid content type: ${contentType}`);
		}

		// Create a Blob from the binary data.
		const blob = new Blob([response?.data || new Uint8Array()], { type: contentType });

		// Optional: Ensure the blob isn't empty.
		if (blob.size === 0) {
			throw new Error('Fetched blob is empty');
		}

		// Save the blob as an attachment on the document.
		await doc.putAttachment({
			id: url,
			data: blob,
			type: blob.type,
		});
	};

	// Build an observable pipeline that:
	// - Waits until a valid document and imageUrl are provided,
	// - Checks if the image attachment already exists,
	// - If not, fetches and stores the image,
	// - And finally creates an object URL from the blob.
	const blob$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				filter(([doc, url]) => isRxDocument(doc) && !!url),
				switchMap(([doc, url]) =>
					doc.allAttachments$.pipe(
						map((attachments: any[]) => attachments.find((attachment) => attachment.id === url)),
						filter((attachment) => {
							if (attachment) {
								return true;
							}
							// Trigger the image fetch if the attachment is missing.
							fetchAndStoreImage(doc, url);
							return false;
						}),
						switchMap((attachment) => attachment?.getData()),
						map((blob) => URL.createObjectURL(blob as Blob))
					)
				)
			),
		[document, imageUrl, get]
	);

	const imageBlobUrl = useObservableState(blob$, undefined);

	// Revoke the object URL when the component unmounts.
	React.useEffect(() => {
		return () => {
			if (imageBlobUrl) {
				URL.revokeObjectURL(imageBlobUrl);
			}
		};
	}, [imageBlobUrl]);

	return { uri: imageBlobUrl };
};
