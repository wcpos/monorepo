import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/tailwind/src/popover';

import { useT } from '../../../../../contexts/translations';
import { CategorySelect } from '../category-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<import('@wcpos/database').ProductCategoryDocument>;
}

/**
 *
 */
export const CategoryPill = ({ query, resource }: Props) => {
	const category = useObservableSuspense(resource);
	const t = useT();
	const isActive = false;

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(id) => {
			query.where('categories', { $elemMatch: { id } });
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<Popover>
			<PopoverTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? 'default' : 'muted'}
					// onPress={() => setOpen(!open)}
					removable={isActive}
					onRemove={() => query.where('categories', null)}
				>
					<ButtonText>{category ? category.name : t('Category', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<CategorySelect onSelect={handleSelect} />
			</PopoverContent>
		</Popover>
	);
};
