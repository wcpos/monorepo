import type { RxDocument } from 'rxdb';

export const useImageAttachment = (document: RxDocument, imageUrl: string) => {
	return { uri: imageUrl };
};
