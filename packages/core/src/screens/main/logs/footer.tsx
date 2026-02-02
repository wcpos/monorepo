import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Query } from '@wcpos/query';

import { useT } from '../../../contexts/translations';

export function LogsFooter({ query, count }: { query: Query<any>; count: number }) {
	const total = useObservableState(query.collection.count({}).$, 0);
	const t = useT();

	/**
	 *
	 */
	return (
		<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
			<HStack className="flex-1 justify-start *:flex-1"></HStack>
			<HStack className="justify-end gap-0">
				<Text className="text-xs">
					{t('Showing {count} of {total}', { count, total })}
				</Text>
			</HStack>
		</HStack>
	);
}
