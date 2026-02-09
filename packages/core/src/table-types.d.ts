/**
 * Pull in the @tanstack/react-table module augmentation from @wcpos/components
 * so that ColumnMeta extensions (width, flex, align, hideLabel, show) are available
 * throughout the core package.
 */
import '@wcpos/components/data-table/types';

import type { RefObject } from 'react';
import type { View } from 'react-native';

import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface TableMeta<TData extends RowData> {
		rowRefs: RefObject<Map<string, RefObject<View>>>;
		newRowUUIDs: string[];
		removeNewRowUUID: (uuid: string) => void;
		onChange?: (data: unknown) => void;
		rowLayouts?: RefObject<Map<string, { y: number; height: number }>>;
		scrollToRow?: (uuid: string) => void;
	}
}
