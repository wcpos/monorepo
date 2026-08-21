import type { EngineRecord } from '@wcpos/query';
import type { WPCredentialsDocument } from '@wcpos/database';

export type ImageAttachmentSource =
	| EngineRecord<'products'>
	| EngineRecord<'variations'>
	| EngineRecord<'customers'>
	| WPCredentialsDocument;
