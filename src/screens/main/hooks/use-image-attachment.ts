import * as React from 'react';
import { Image } from 'react-native';

type RxDocument = import('rxdb').RxDocument;

async function fetchAndStoreImage(document: RxDocument, imageUrl: string) {
	// Check if attachment already exists
	const attachment = await document.getAttachment(imageUrl);

	if (attachment) {
		// If attachment exists, return the blob URL
		const blob = await attachment.getData();
		return URL.createObjectURL(blob);
	}

	// If attachment does not exist, fetch the image, convert to blob and store as attachment
	const response = await fetch(imageUrl);
	const blob = await response.blob();

	await document.putAttachment({
		id: imageUrl,
		data: blob,
		type: blob.type,
	});

	return URL.createObjectURL(blob);
}

interface ImageAttachment {
	uri: string;
	width: number;
	height: number;
}

/**
 * Returns an image blob from the attachment.
 * - also returns the image dimensions
 * - fetches and stores the image blob if it doesn't not exist
 * - imageUrl is used as the attachment id
 */
export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	const [image, setImage] = React.useState<ImageAttachment | null>(null);

	React.useEffect(() => {
		fetchAndStoreImage(document, imageUrl).then((blob) => {
			if (blob) {
				Image.getSize(blob, (width, height) => {
					setImage({ uri: blob, width, height });
				});
			}
		});
	}, [document, imageUrl]);

	return image;
};
