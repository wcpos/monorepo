import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { BrandSearch } from '../brand-select';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductCategoryDocument>;
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
				<ButtonPill
					size="xs"
					leftIcon="folder"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					removeTestID="filter-pill-remove-brands"
					onRemove={() => actions.clearFilter('brands')}
				>
					<ButtonText decodeHtml>
						{isActive ? brand?.name || t('common.id_2', { id: selectedID }) : t('common.brand')}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<BrandSearch />
			</ComboboxContent>
		</Combobox>
	);
}
