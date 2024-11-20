import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Combobox,
	ComboboxTriggerPrimitive,
	ComboboxContent,
} from '@wcpos/components/src/combobox';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { CategorySearch } from '../category-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<import('@wcpos/database').ProductCategoryDocument>;
	selectedID?: number;
}

/**
 *
 */
export const CategoryPill = ({ query, resource, selectedID }: Props) => {
	const category = useObservableSuspense(resource);
	const t = useT();
	const isActive = !!selectedID;

	/**
	 * @NOTE - we need to convert the value to a number because the value is a string
	 */
	const handleSelect = React.useCallback(
		({ value }) => {
			query
				.where('categories')
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
			<ComboboxTriggerPrimitive asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={() =>
						query.where('categories').removeElemMatch('categories', { id: category?.id }).exec()
					}
				>
					<ButtonText>
						{isActive
							? category?.name || t('ID: {id}', { id: selectedID, _tags: 'core' })
							: t('Category', { _tags: 'core' })}
					</ButtonText>
				</ButtonPill>
			</ComboboxTriggerPrimitive>
			<ComboboxContent>
				<CategorySearch />
			</ComboboxContent>
		</Combobox>
	);
};
