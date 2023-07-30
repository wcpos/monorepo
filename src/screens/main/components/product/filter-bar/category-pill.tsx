import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { useStoreStateManager } from '../../../../../contexts/store-state-manager';
import { t } from '../../../../../lib/translations';
import CategorySelect from '../category-select';

interface CategoryPillProps {
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
const CategoryPill = ({ resource }: CategoryPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const manager = useStoreStateManager();
	const query = manager.getQuery(['products']);
	const category = useObservableSuspense(resource);

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
		<CategorySelect onBlur={() => setOpenSelect(false)} />
	) : (
		<Pill icon="folder" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Category', { _tags: 'core' })}
		</Pill>
	);
};

export default CategoryPill;
