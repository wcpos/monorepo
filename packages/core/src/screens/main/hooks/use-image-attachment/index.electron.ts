import * as React from 'react';

import { isRxDocument } from 'rxdb';

import { isEngineRecordFace } from './types';

import type { ImageAttachmentSource } from './types';

/**
 * Electron-specific image attachment hook.
 *
 * Instead of downloading images in the renderer and storing them as RxDB attachments
 * (which fails because Blob doesn't survive Electron's contextBridge serialization),
 * we construct a wcpos-image:// URL. The main process protocol handler downloads
 * and caches images on disk, serving them directly to Chromium without IPC.
 */
function toBase64UrlUtf8(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toImageCacheUrl(url: string): string {
	return `wcpos-image://cache/${toBase64UrlUtf8(url)}`;
}

export const useImageAttachment = (source: ImageAttachmentSource, imageUrl: string) => {
	const uri = React.useMemo(() => {
		if ((!isEngineRecordFace(source) && !isRxDocument(source)) || !imageUrl) {
			return undefined;
		}
		return toImageCacheUrl(imageUrl);
	}, [source, imageUrl]);

	return {
		uri,
		error: null,
	};
};
