import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, ObservableResource, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Dropdown from '@wcpos/components/src/dropdown';
import Pill from '@wcpos/components/src/pill';
import type { ProductCollection, StoreDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { findMetaDataSelector } from './utils';
import { useT } from '../../../../contexts/translations';

interface Props {
	query: Query<ProductCollection>;
	resource: ObservableResource<StoreDocument>;
}

/**
 *
 */
export const StorePill = ({ resource, query }: Props) => {
	const stores = useObservableSuspense(resource);
	const selectedCreatedVia = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'created_via']))),
		get(query.getParams(), ['selector', 'created_via'])
	) as string | undefined;
	/**
	 * Selected store ID as a string
	 */
	const selectedStoreID = useObservableState(
		query.params$.pipe(map((params) => findMetaDataSelector(params, '_pos_store'))),
		findMetaDataSelector(query.getParams(), '_pos_store')
	);
	const t = useT();
	const isActive = !!(selectedCreatedVia || selectedStoreID);
	const selected = selectedCreatedVia || selectedStoreID;
	const [open, setOpen] = React.useState(false);

	/**
	 *
	 */
	const getLabel = React.useCallback(
		(id) => {
			const number = Number(id);
			if (Number.isInteger(number) && !isNaN(number)) {
				const store = stores.find((s) => s.id === number);
				return store ? store.name : null;
			} else {
				switch (id) {
					case 'woocommerce-pos':
						return t('POS', { _tags: 'core' });
					case 'checkout':
						return t('Online Store', { _tags: 'core' });
					case 'admin':
						return t('WP Admin', { _tags: 'core' });
				}
			}
		},
		[stores, t]
	);

	/**
	 *
	 */
	const items = React.useMemo(() => {
		const items = [
			{
				label: getLabel('woocommerce-pos'),
				value: 'woocommerce-pos',
				action: () => query.where('created_via', 'woocommerce-pos'),
			},
			{
				label: getLabel('checkout'),
				value: 'checkout',
				action: () => query.where('created_via', 'checkout'),
			},
			{
				label: getLabel('admin'),
				value: 'admin',
				action: () => query.where('created_via', 'admin'),
			},
			{ label: '__' },
		];

		stores.map((store) => {
			items.push({
				label: store.name,
				value: store.id,
				action: (id) => {
					query.where('meta_data', {
						$elemMatch: { key: '_pos_store', value: String(id) },
					});
				},
			});
		});

		return items;
	}, [getLabel, stores, query]);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		if (!selected) {
			return t('Select Store', { _tags: 'core' });
		}

		return getLabel(selected);
	}, [getLabel, selected, t]);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.where('created_via', null);
		query.where('meta_data', null);
	}, [query]);

	/**
	 *
	 */
	return (
		<Dropdown
			items={items}
			opened={open}
			onClose={() => setOpen(false)}
			withArrow={false}
			onSelect={() => {}}
			placement="bottom-start"
		>
			<Pill
				icon="shop"
				size="small"
				color={isActive ? 'primary' : 'lightGrey'}
				onPress={() => setOpen(true)}
				removable={isActive}
				onRemove={handleRemove}
			>
				{label}
			</Pill>
		</Dropdown>
	);
};
