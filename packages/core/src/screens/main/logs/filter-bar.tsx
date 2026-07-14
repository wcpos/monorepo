import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@wcpos/components/select';
import type { Option } from '@wcpos/components/select';

import { useQueryState, useQueryStateActions } from '../../../query';
import { useT } from '../../../contexts/translations';

export const DEFAULT_LOG_LEVELS = ['error', 'warn', 'info', 'success'];

export function FilterBar() {
	const levels = useQueryState<'logs', string[] | undefined>((state) => state.filters.level);
	const { setFilter, clearFilter } = useQueryStateActions<'logs'>();
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
	 * Convert the selected store values to Select options.
	 */
	const selectedOptions = React.useMemo(() => {
		return items.filter((item) => levels?.includes(item.value));
	}, [items, levels]);

	const isActive = selectedOptions.length > 0;

	/**
	 * Commit selected options to query state.
	 */
	const handleValueChange = React.useCallback(
		(options: Option[]) => {
			const defined = options.filter((o): o is NonNullable<Option> => o !== undefined);
			if (defined.length === 0) {
				clearFilter('level');
			} else {
				setFilter(
					'level',
					defined.map((option) => option.value)
				);
			}
		},
		[clearFilter, setFilter]
	);

	const displayText = React.useMemo(() => {
		if (selectedOptions.length === 0) return t('logs.log_level');
		return selectedOptions.map((o) => o.label).join(', ');
	}, [selectedOptions, t]);

	return (
		<HStack className="w-full flex-wrap">
			<Select multiple value={selectedOptions} onValueChange={handleValueChange}>
				<SelectTrigger asChild>
					<ButtonPill
						size="xs"
						leftIcon="tags"
						variant={isActive ? undefined : 'muted'}
						removable={isActive}
						onRemove={() => clearFilter('level')}
					>
						<ButtonText>{displayText}</ButtonText>
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
