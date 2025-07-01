import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { TagSearch } from '../tag-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
	selectedID?: number;
}

/**
 *
 */
export const TagPill = ({ query, resource, selectedID }: Props) => {
	const tag = useObservableSuspense(resource);
	const t = useT();
	const isActive = !!selectedID;

	/**
	 * @NOTE - we need to convert the value to a number because the value is a string
	 */
	const handleSelect = React.useCallback(
		({ value }) => {
			query
				.where('tags')
				.elemMatch({ id: toNumber(value) })
				.exec();
		},
		[query]
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
					onRemove={() => query.where('tags').removeElemMatch('tags', { id: tag?.id }).exec()}
				>
					<ButtonText decodeHtml>
						{isActive
							? tag?.name || t('ID: {id}', { id: selectedID, _tags: 'core' })
							: t('Tag', { _tags: 'core' })}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
};
