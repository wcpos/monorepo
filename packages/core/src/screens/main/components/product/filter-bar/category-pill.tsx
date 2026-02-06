import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
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
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() =>
						query.where('categories').removeElemMatch('categories', { id: category?.id }).exec()
					}
				>
					<ButtonText decodeHtml>
						{isActive
							? category?.name || t('common.id_2', { id: selectedID })
							: t('common.category')}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<CategorySearch />
			</ComboboxContent>
		</Combobox>
	);
};
