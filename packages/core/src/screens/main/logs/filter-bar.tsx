import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import type { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

const MAX_LABEL_LENGTH = 24;

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
	 * Extract selected values from the selector
	 * The selector can be:
	 * - undefined (no filter)
	 * - { $in: ['info', 'error'] } (multi-select)
	 * - 'info' (single value, from clicking a pill)
	 */
	const selectedValues = React.useMemo(() => {
		if (!selector) return [];
		if (typeof selector === 'string') return [selector];
		if (selector.$in) return selector.$in as string[];
		return [];
	}, [selector]);

	const isActive = selectedValues.length > 0;

	/**
	 * Toggle a level in the filter
	 */
	const handleToggle = React.useCallback(
		(value: string) => {
			const newValues = selectedValues.includes(value)
				? selectedValues.filter((v) => v !== value)
				: [...selectedValues, value];

			if (newValues.length === 0) {
				query.removeWhere('level').exec();
			} else {
				query.where('level').in(newValues).exec();
			}
		},
		[query, selectedValues]
	);

	/**
	 * Get display label for the pill
	 * Shows comma-separated level names, truncated if too long
	 */
	const displayLabel = React.useMemo(() => {
		if (selectedValues.length === 0) {
			return t('logs.log_level');
		}

		// Get labels in the order they appear in items array
		const labels = items
			.filter((item) => selectedValues.includes(item.value))
			.map((item) => item.label);

		const fullLabel = labels.join(', ');

		if (fullLabel.length <= MAX_LABEL_LENGTH) {
			return fullLabel;
		}

		// Truncate and add ellipsis
		return fullLabel.slice(0, MAX_LABEL_LENGTH - 1) + '…';
	}, [items, selectedValues, t]);

	return (
		<HStack className="w-full flex-wrap">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<ButtonPill
						size="xs"
						leftIcon="tags"
						variant={isActive ? undefined : 'muted'}
						removable={isActive}
						onRemove={() => query.removeWhere('level').exec()}
					>
						<ButtonText>{displayLabel}</ButtonText>
					</ButtonPill>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					{items.map((item) => (
						<DropdownMenuCheckboxItem
							key={item.value}
							checked={selectedValues.includes(item.value)}
							onCheckedChange={() => handleToggle(item.value)}
						>
							<Text>{item.label}</Text>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</HStack>
	);
}
