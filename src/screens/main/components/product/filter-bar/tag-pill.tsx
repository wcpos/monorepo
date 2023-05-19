import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import TagSelect from '../../../components/tag-select';

interface TagPillProps {
	selectedTagResource: ObservableResource<any>;
	setQuery: any;
}

/**
 *
 */
const TagPill = ({ selectedTagResource, setQuery }: TagPillProps) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const tag = useObservableSuspense(selectedTagResource);

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
