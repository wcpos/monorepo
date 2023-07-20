import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import { useProducts } from '../../../contexts/products';
import TagSelect from '../tag-select';

interface TagPillProps {
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
const TagPill = ({ resource }: TagPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const { setQuery } = useProducts();
	const tag = useObservableSuspense(resource);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		setQuery('selector.tags', null);
	}, [setQuery]);

	/**
	 *
	 */
	if (tag) {
		return (
			<Pill size="small" removable onRemove={handleRemove} icon="tag">
				{tag.name}
			</Pill>
		);
	}

	/**
	 *
	 */
	return openSelect ? (
		<TagSelect onBlur={() => setOpenSelect(false)} />
	) : (
		<Pill icon="tag" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Tag', { _tags: 'core' })}
		</Pill>
	);
};

export default TagPill;
