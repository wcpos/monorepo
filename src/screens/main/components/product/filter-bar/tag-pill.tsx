import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { useStoreStateManager } from '../../../../../contexts/store-state-manager';
import { t } from '../../../../../lib/translations';
import TagSelect from '../tag-select';

interface TagPillProps {
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
const TagPill = ({ resource }: TagPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const tag = useObservableSuspense(resource);
	const manager = useStoreStateManager();
	const query = manager.getQuery(['products']);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.where('tags', null);
	}, [query]);

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
