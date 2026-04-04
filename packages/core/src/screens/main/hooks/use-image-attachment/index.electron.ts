import * as React from 'react';

import { isRxDocument } from 'rxdb';

type RxDocument = import('rxdb').RxDocument;

/**
 * Electron-specific image attachment hook.
 *
 * Instead of downloading images in the renderer and storing them as RxDB attachments
 * (which fails because Blob doesn't survive Electron's contextBridge serialization),
 * we construct a wcpos-image:// URL. The main process protocol handler downloads
 * and caches images on disk, serving them directly to Chromium without IPC.
 */
function toImageCacheUrl(url: string): string {
	// btoa produces standard base64; convert to base64url for safe use in URLs
	const base64 = btoa(url);
	return `wcpos-image://cache/${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	const uri = React.useMemo(() => {
		if (!isRxDocument(document) || !imageUrl) {
			return undefined;
		}
		return toImageCacheUrl(imageUrl);
	}, [document, imageUrl]);

	return {
		uri,
		isLoading: false,
		error: null,
	};
};
