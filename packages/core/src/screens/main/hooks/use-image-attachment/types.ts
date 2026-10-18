import type { EngineRecord } from '@wcpos/query';
import type { ReadonlyWpCredentialsRecord } from '@wcpos/query/user-db';

export type ImageAttachmentSource =
	| EngineRecord<'products'>
	| EngineRecord<'variations'>
	| EngineRecord<'customers'>
	| ReadonlyWpCredentialsRecord;
