import * as React from 'react';

import { isRxDocument } from 'rxdb';

import { useHttpClient } from '@wcpos/hooks/use-http-client';

type RxDocument = import('rxdb').RxDocument;

export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	const { get } = useHttpClient();
	const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined);
	const [isLoading, setIsLoading] = React.useState(false);
	const [error, setError] = React.useState<Error | null>(null);

	const hasValidSource = isRxDocument(document) && !!imageUrl;

	React.useEffect(() => {
		if (!hasValidSource) {
			// No valid source: nothing to load. The returned uri is derived as
			// undefined below, so no setState is needed here.
			return;
		}

		const loadImage = async () => {
			try {
				setIsLoading(true);
				setError(null);

				// First, check if we already have this attachment
				const existingAttachment = document.getAttachment(imageUrl);
				if (existingAttachment) {
					const blob = await existingAttachment.getData();
					const objectUrl = URL.createObjectURL(blob);
					setBlobUrl(objectUrl);
					return;
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

				// Store the attachment
				await document.putAttachment({
					id: imageUrl,
					data: blob,
					type: blob.type,
				});

				// Create and set the object URL
				const objectUrl = URL.createObjectURL(blob);
				setBlobUrl(objectUrl);
			} catch (err) {
				setError(err instanceof Error ? err : new Error('Unknown error'));
				setBlobUrl(undefined);
			} finally {
				setIsLoading(false);
			}
		};

		loadImage();
	}, [document, imageUrl, get, hasValidSource]);

	// Cleanup object URL when it changes or component unmounts
	React.useEffect(() => {
		return () => {
			if (blobUrl) {
				URL.revokeObjectURL(blobUrl);
			}
		};
	}, [blobUrl]);

	return {
		// When there's no valid source the uri is undefined regardless of any
		// previously-loaded blob (derived rather than reset via setState).
		uri: hasValidSource ? blobUrl : undefined,
		isLoading,
		error,
	};
};
