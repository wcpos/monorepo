import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useReplicationState } from '@wcpos/query';
import type { Query } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { SyncButton } from '../components/sync-button';
import { useCollectionReset } from '../hooks/use-collection-reset';

interface TaxRatesFooterProps {
	count: number;
	query: Query<import('rxdb').RxCollection>;
}

/**
 *
 */
export function TaxRatesFooter({ count, query }: TaxRatesFooterProps) {
	const { sync, active$, total$ } = useReplicationState(query);
	const { clearAndSync } = useCollectionReset('taxes');
	const active = useObservableState(active$, false);
	const total = useObservableState(total$ ?? of(0), 0);
	const t = useT();

	return (
		<HStack className="border-border bg-footer justify-end gap-0 border-t p-2">
			<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			<SyncButton sync={sync} clearAndSync={clearAndSync} active={active} />
		</HStack>
	);
}
