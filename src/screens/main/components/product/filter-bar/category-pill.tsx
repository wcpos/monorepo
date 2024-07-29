import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/tailwind/src/popover';

import { useT } from '../../../../../contexts/translations';
import { CategorySearch } from '../category-search';

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
	const [open, setOpen] = React.useState(false);
	const [value, setValue] = React.useState('');
	const isActive = false;

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(id) => {
			query.where('categories', { $elemMatch: { id } });
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
	return (
		<Popover value={value} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? 'default' : 'secondary'}
					// onPress={() => setOpen(!open)}
					removable={isActive}
					onRemove={() => query.where('stock_status', null)}
				>
					<ButtonText>{t('Category', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<CategorySearch onSelect={handleSelect} />
			</PopoverContent>
		</Popover>
	);

	/**
	 *
	 */
	// if (category) {
	// 	return (
	// 		<Pill size="small" removable onRemove={handleRemove} icon="folder">
	// 			{category.name}
	// 		</Pill>
	// 	);
	// }

	/**
	 *
	 */
	// return openSelect ? (
	// 	<CategorySelect onBlur={() => setOpenSelect(false)} onSelect={handleSelect} />
	// ) : (
	// 	<Pill icon="folder" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
	// 		{t('Select Category', { _tags: 'core' })}
	// 	</Pill>
	// );
};

export default CategoryPill;
