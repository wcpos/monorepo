import type { EngineRecord } from '@wcpos/query';

type LegacyImageDocument = import('rxdb').RxDocument;

export type ImageAttachmentSource =
	EngineRecord<'products'> | EngineRecord<'variations'> | LegacyImageDocument;

export function isEngineRecordFace(
	source: ImageAttachmentSource
): source is EngineRecord<'products'> | EngineRecord<'variations'> {
	return 'payload' in source;
}
