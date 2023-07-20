import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import { useProducts } from '../../../contexts/products';
import CategorySelect from '../category-select';

interface CategoryPillProps {
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
const CategoryPill = ({ resource }: CategoryPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const { setQuery } = useProducts();
	const category = useObservableSuspense(resource);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		setQuery('selector.categories', null);
	}, [setQuery]);

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
		<CategorySelect onBlur={() => setOpenSelect(false)} />
	) : (
		<Pill icon="folder" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Category', { _tags: 'core' })}
		</Pill>
	);
};

export default CategoryPill;
