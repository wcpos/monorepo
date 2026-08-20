import * as React from 'react';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';

/**
 *
 */
export function Avatar({ row }: CellContext<{ record: EngineRecord<'customers'> }, 'avatar_url'>) {
	const record = row.original.record;
	const avatarUrl = useRecordField(record, ({ payload }) => payload.avatar_url);
	const { uri } = useImageAttachment(record, avatarUrl ?? '');

	return <Image source={{ uri }} className="h-10 w-10 rounded" recyclingKey={record.uuid} />;
}
