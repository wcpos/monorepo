import { useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

import type { useCollectionBinding } from '../../../query';

type LogsBinding = ReturnType<typeof useCollectionBinding<'logs'>>;

interface LogsFooterProps extends Pick<LogsBinding, 'active$' | 'sync' | 'total$'> {
	count: number;
}

export function LogsFooter({ total$, count }: LogsFooterProps) {
	const total = useObservableState(total$, 0);
	const t = useT();

	/**
	 *
	 */
	return (
		<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
			<HStack className="flex-1 justify-start *:flex-1"></HStack>
			<HStack className="justify-end gap-0">
				<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			</HStack>
		</HStack>
	);
}
