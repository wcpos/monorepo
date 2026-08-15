import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { TagSearch } from '../tag-select';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
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
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					removeTestID="filter-pill-remove-tags"
					onRemove={() => actions.clearFilter('tags')}
				>
					<ButtonText decodeHtml>
						{isActive ? tag?.name || t('common.id_2', { id: selectedID }) : t('common.tag')}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
}
