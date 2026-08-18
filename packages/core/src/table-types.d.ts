/**
 * Pull in the @tanstack/react-table module augmentation from @wcpos/components
 * so that ColumnMeta extensions (width, flex, align, hideLabel, show) are available
 * throughout the core package.
 */
import '@wcpos/components/data-table/types';

import type { RefObject } from 'react';

import type { PulseTableRowRef } from '@wcpos/components/table';

import type { RowData, TableFeatures } from '@tanstack/react-table';

export type {
	Cell,
	CellContext,
	Column,
	ColumnDef,
	Header,
	HeaderContext,
	Row,
	Table,
} from '@wcpos/components/data-table/types';

declare module '@tanstack/react-table' {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface TableMeta<in out TFeatures extends TableFeatures, in out TData extends RowData> {
		rowRefs: RefObject<Map<string, PulseTableRowRef | null>>;
		newRowUUIDs: string[];
		removeNewRowUUID: (uuid: string) => void;
		onChange?: (data: unknown) => void;
		rowLayouts?: RefObject<Map<string, { y: number; height: number }>>;
		scrollToRow?: (uuid: string) => void;
	}
}
