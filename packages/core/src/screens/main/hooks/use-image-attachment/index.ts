type RxDocument = import('rxdb').RxDocument;

/**
 * I can't get rxdb to save Blob on native, so we're just using the imageUrl directly.
 * Expo-image has caching built in, I'm not sure about offline support though.
 */
export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	return {
		uri: imageUrl,
		isLoading: false,
		error: null,
	};
};
