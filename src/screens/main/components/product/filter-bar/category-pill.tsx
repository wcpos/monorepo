import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/components/src/popover';

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
	const isActive = !!category;
	const triggerRef = React.useRef(null);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(id) => {
			query.where('categories', { $elemMatch: { id } });
			if (triggerRef.current) {
				triggerRef.current.close();
			}
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<Popover>
			<PopoverTrigger ref={triggerRef} asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? 'default' : 'muted'}
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
