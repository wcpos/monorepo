import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { TagSearch } from '../tag-select';

interface Props {
	resource: ObservableResource<EngineRecord<'tags'> | null>;
	selectedID?: number;
}

/**
 *
 */
export function TagPill({ resource, selectedID }: Props) {
	const tag = useObservableSuspense(resource);
	const actions = useQueryStateActions<'products'>();
	const t = useT();
	const isActive = !!selectedID;

	/**
	 * @NOTE - we need to convert the value to a number because the value is a string
	 */
	const handleSelect = React.useCallback(
		(option: import('@wcpos/components/combobox').Option | undefined) => {
			if (!option) return;
			actions.setFilter('tags', [toNumber(option.value)]);
		},
		[actions]
	);

	/**
	 *
	 */
	return (
		<Combobox onValueChange={handleSelect}>
			<ComboboxTrigger asChild>
				<Chip
					icon="folder"
					on={isActive}
					testID="filter-pill-tags"
					clearTestID="filter-pill-remove-tags"
					onClear={isActive ? () => actions.clearFilter('tags') : undefined}
					clearLabel={t('common.remove')}
					label={decode(
						isActive ? tag?.payload.name || t('common.id_2', { id: selectedID }) : t('common.tags')
					)}
				/>
			</ComboboxTrigger>
			<ComboboxContent>
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
}
