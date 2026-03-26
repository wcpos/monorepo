import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import { Query } from '@wcpos/query';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { Option } from '@wcpos/components/combobox/types';

import { useT } from '../../../../../contexts/translations';
import { CategoryTreeLoader } from '../category-select';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
export function CategoryPill({ query }: Props) {
	const t = useT();
	const [selected, setSelected] = React.useState<Option[]>([]);
	const [options, setOptions] = React.useState<HierarchicalOption[]>([]);

	const isActive = selected.length > 0;

	const handleChange = React.useCallback(
		(options: Option[]) => {
			setSelected(options);
			if (options.length > 0) {
				const orConditions = options.map((opt) => ({
					categories: { $elemMatch: { id: toNumber(opt.value) } },
				}));
				query
					.removeWhere('categories')
					.and([{ $or: orConditions }])
					.exec();
			} else {
				query.removeWhere('categories').exec();
			}
		},
		[query]
	);

	const handleRemove = React.useCallback(() => {
		setSelected([]);
		query.removeWhere('categories').exec();
	}, [query]);

	const displayText = React.useMemo(() => {
		if (selected.length === 0) return t('common.category');
		if (selected.length === 1) return selected[0].label;
		return `${selected[0].label} +${selected.length - 1}`;
	}, [selected, t]);

	return (
		<TreeCombobox options={options} multiple value={selected} onValueChange={handleChange}>
			<TreeComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={handleRemove}
				>
					<ButtonText decodeHtml>{displayText}</ButtonText>
				</ButtonPill>
			</TreeComboboxTrigger>
			<TreeComboboxContent
				searchPlaceholder={t('common.search_categories')}
				emptyMessage={t('common.no_category_found')}
			>
				<CategoryTreeLoader onOptionsLoaded={setOptions} />
			</TreeComboboxContent>
		</TreeCombobox>
	);
}
