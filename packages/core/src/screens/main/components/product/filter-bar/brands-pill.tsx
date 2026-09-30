import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { BrandSearch } from '../brand-select';

interface Props {
	resource: ObservableResource<EngineRecord<'brands'> | null>;
	selectedID?: number;
}

/**
 *
 */
export function BrandsPill({ resource, selectedID }: Props) {
	const brand = useObservableSuspense(resource);
	const actions = useQueryStateActions<'products'>();
	const t = useT();
	const isActive = !!selectedID;

	/**
	 * @NOTE - we need to convert the value to a number because the value is a string
	 */
	const handleSelect = React.useCallback(
		(option: import('@wcpos/components/combobox').Option | undefined) => {
			if (!option) return;
			actions.setFilter('brands', [toNumber(option.value)]);
		},
		[actions]
	);

	/**
	 *
	 */
	return (
		<Combobox onValueChange={handleSelect}>
			<ComboboxTrigger asChild>
				<Chip
					icon="folder"
					on={isActive}
					testID="filter-pill-brands"
					clearTestID="filter-pill-remove-brands"
					onClear={isActive ? () => actions.clearFilter('brands') : undefined}
					clearLabel={t('common.remove')}
					label={decode(
						isActive
							? brand?.payload.name || t('common.id_2', { id: selectedID })
							: t('common.brands')
					)}
				/>
			</ComboboxTrigger>
			<ComboboxContent>
				<BrandSearch />
			</ComboboxContent>
		</Combobox>
	);
}
