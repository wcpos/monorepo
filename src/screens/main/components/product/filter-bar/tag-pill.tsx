import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxTriggerPrimitive,
} from '@wcpos/components/src/combobox';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { TagSearch } from '../tag-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
export const TagPill = ({ query, resource }: Props) => {
	const tag = useObservableSuspense(resource);
	const t = useT();
	const isActive = !!tag;

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		({ value }) => {
			query.where('tags', { $elemMatch: { id: parseInt(value, 10) } });
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<Combobox onValueChange={handleSelect}>
			<ComboboxTriggerPrimitive asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={() => query.where('tags', null)}
				>
					<ButtonText>{tag ? tag.name : t('Tag', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
};
