import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import CategorySelect from '../category-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
const CategoryPill = ({ query, resource }: Props) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const category = useObservableSuspense(resource);
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(category) => {
			query.where('categories', { $elemMatch: { id: category.id } });
		},
		[query]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.where('categories', null);
	}, [query]);

	/**
	 *
	 */
	if (category) {
		return (
			<Pill size="small" removable onRemove={handleRemove} icon="folder">
				{category.name}
			</Pill>
		);
	}

	/**
	 *
	 */
	return openSelect ? (
		<CategorySelect onBlur={() => setOpenSelect(false)} onSelect={handleSelect} />
	) : (
		<Pill icon="folder" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Category', { _tags: 'core' })}
		</Pill>
	);
};

export default CategoryPill;
