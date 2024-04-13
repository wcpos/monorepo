import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import TagSelect from '../tag-select';

type ProductCollection = import('@wcpos/database').ProductCollection;
type ProductTagDocument = import('@wcpos/database').ProductTagDocument;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<ProductTagDocument>;
}

/**
 *
 */
const TagPill = ({ query, resource }: Props) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const tag = useObservableSuspense(resource);
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(tag) => {
			query.where('tags', { $elemMatch: { id: tag.id } });
		},
		[query]
	);

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
		<TagSelect onBlur={() => setOpenSelect(false)} onSelect={handleSelect} />
	) : (
		<Pill icon="tag" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select Tag', { _tags: 'core' })}
		</Pill>
	);
};

export default TagPill;
