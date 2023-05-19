import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import CategorySelect from '../../../components/category-select';

interface CategoryPillProps {
	selectedCategoryResource: ObservableResource<any>;
	setQuery: any;
}

/**
 *
 */
const CategoryPill = ({ selectedCategoryResource, setQuery }: CategoryPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const category = useObservableSuspense(selectedCategoryResource);

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
