import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import type { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import type { Option } from '@wcpos/components/select';

import { useT } from '../../../contexts/translations';

export const DEFAULT_LOG_LEVELS = ['error', 'warn', 'info', 'success'];

export function FilterBar({ query }: { query: Query<any> }) {
	const selector = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('level')))
	);
	const t = useT();

	const items = React.useMemo(
		() => [
			{ value: 'error', label: t('common.error') },
			{ value: 'warn', label: t('logs.warning') },
			{ value: 'info', label: t('logs.info') },
			{ value: 'success', label: t('logs.success') },
			{ value: 'audit', label: t('logs.audit') },
		],
		[t]
	);

	/**
	 * Extract selected values from the selector and convert to Option[]
	 */
	const selectedOptions = React.useMemo(() => {
		let values: string[] = [];
		if (!selector) {
			values = [];
		} else if (typeof selector === 'string') {
			values = [selector];
		} else if (selector.$in) {
			values = selector.$in as string[];
		}
		return items.filter((item) => values.includes(item.value));
	}, [selector, items]);

	const isActive = selectedOptions.length > 0;

	/**
	 * Sync selected options back to query
	 */
	const handleValueChange = React.useCallback(
		(options: Option[]) => {
			const defined = options.filter((o): o is NonNullable<Option> => o !== undefined);
			if (defined.length === 0) {
				query.removeWhere('level').exec();
			} else {
				query
					.where('level')
					.in(defined.map((o) => o.value))
					.exec();
			}
		},
		[query]
	);

	return (
		<HStack className="w-full flex-wrap">
			<Select multiple value={selectedOptions} onValueChange={handleValueChange}>
				<SelectTrigger asChild>
					<ButtonPill
						size="xs"
						leftIcon="tags"
						variant={isActive ? undefined : 'muted'}
						removable={isActive}
						onRemove={() => query.removeWhere('level').exec()}
					>
						<ButtonText>
							<SelectValue placeholder={t('logs.log_level')} truncationStyle="ellipsis" />
						</ButtonText>
					</ButtonPill>
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value} label={item.label} />
					))}
				</SelectContent>
			</Select>
		</HStack>
	);
}
