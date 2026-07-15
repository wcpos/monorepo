import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useReplicationState } from '@wcpos/query';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useQueryStateActions } from '../../../../query';
import { useCollectionReset } from '../../hooks/use-collection-reset';
import { SyncButton } from '../sync-button';

import type { CollectionKey } from '../../hooks/use-collection';
import type { Observable } from 'rxjs';

interface CommonProps {
	children?: React.ReactNode;
	count: number;
}

type LegacyProps = CommonProps & {
	query: Query<any>;
	collectionName?: never;
	active$?: never;
	total$?: never;
	totalSource$?: never;
	sync?: never;
};

type BindingProps = CommonProps & {
	query?: never;
	collectionName: CollectionKey;
	active$: Observable<boolean>;
	total$: Observable<number>;
	totalSource$: Observable<'coverage' | 'local'>;
	sync: () => Promise<void>;
};

type Props = LegacyProps | BindingProps;

type FooterContentProps = CommonProps &
	Pick<BindingProps, 'active$' | 'sync' | 'total$' | 'totalSource$'> & {
		clearAndSync: () => Promise<void>;
	};

/**
 *
 */
function FooterContent({
	children,
	count,
	active$,
	total$,
	totalSource$,
	sync,
	clearAndSync,
}: FooterContentProps) {
	const loading = useObservableEagerState(active$);
	const total = useObservableState(total$, 0);
	const totalSource = useObservableState(totalSource$, 'local');
	const t = useT();

	return (
		<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
			<HStack className="flex-1 justify-start *:flex-1">{children}</HStack>
			<HStack className="justify-end gap-0">
				<Text testID="data-table-count" className="text-xs">
					{t('common.showing_of', { shown: count, total })}
				</Text>
				{totalSource === 'local' ? (
					<Text className="text-muted-foreground ml-1 text-[10px]">
						{t('common.showing_local_items')}
					</Text>
				) : null}
				<SyncButton sync={sync} clearAndSync={clearAndSync} active={loading} />
			</HStack>
		</HStack>
	);
}

function LegacyDataTableFooter({ query, ...props }: LegacyProps) {
	const projections = useReplicationState(query);
	const { clearAndSync } = useCollectionReset(query.collection.name);
	return <FooterContent {...props} {...projections} clearAndSync={clearAndSync} />;
}

function BindingDataTableFooter({ collectionName, ...props }: BindingProps) {
	const { clearAndSync } = useCollectionReset(collectionName);
	const { clearSearch, resetFilters } = useQueryStateActions();
	const resetQueryAndCollection = React.useCallback(() => {
		clearSearch();
		resetFilters();
		return clearAndSync();
	}, [clearAndSync, clearSearch, resetFilters]);

	return <FooterContent {...props} clearAndSync={resetQueryAndCollection} />;
}

export function DataTableFooter(props: Props) {
	return props.query ? <LegacyDataTableFooter {...props} /> : <BindingDataTableFooter {...props} />;
}
