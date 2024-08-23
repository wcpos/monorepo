import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/tailwind/src/popover';

import { useT } from '../../../../../contexts/translations';
import { TagSelect } from '../tag-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<import('@wcpos/database').ProductTagDocument>;
}

/**
 *
 */
export const TagPill = ({ query, resource }: Props) => {
	const tag = useObservableSuspense(resource);
	const t = useT();
	const isActive = !!tag;
	const triggerRef = React.useRef(null);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(id) => {
			query.where('tags', { $elemMatch: { id } });
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
					onRemove={() => query.where('tags', null)}
				>
					<ButtonText>{tag ? tag.name : t('Tag', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<TagSelect onSelect={handleSelect} />
			</PopoverContent>
		</Popover>
	);
};
