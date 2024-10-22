import * as React from 'react';

import isString from 'lodash/isString';
import { useObservableSuspense, ObservableResource, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitive,
	SelectGroup,
	SelectLabel,
	SelectSeparator,
} from '@wcpos/components/src/select';
import type { OrderCollection, StoreDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';

interface Props {
	query: Query<OrderCollection>;
	resource: ObservableResource<StoreDocument>;
}

/**
 *
 */
export const StorePill = ({ resource, query }: Props) => {
	const stores = useObservableSuspense(resource);
	const selectedCreatedVia = useObservableState(
		query.params$.pipe(map(() => query.findSelector('created_via'))),
		query.findSelector('created_via')
	) as string | undefined;
	/**
	 * Selected store ID as a string
	 */
	const selectedStoreID = useObservableState(
		query.params$.pipe(map(() => query.findMetaDataSelector('_pos_store'))),
		query.findMetaDataSelector('_pos_store')
	);
	const t = useT();
	const isActive = !!(selectedCreatedVia || selectedStoreID);
	const selected = selectedCreatedVia || selectedStoreID;
	const [open, setOpen] = React.useState(false);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const number = Number(selected);
		if (Number.isInteger(number) && !isNaN(number)) {
			const store = (stores || []).find((s) => s.id === number);
			if (store) {
				return { value: number, label: store.name };
			}
			return store ? store.name : null;
		} else {
			switch (selected) {
				case 'woocommerce-pos':
					return { value: 'woocommerce-pos', label: t('POS', { _tags: 'core' }) };
				case 'checkout':
					return { value: 'checkout', label: t('Online Store', { _tags: 'core' }) };
				case 'admin':
					return { value: 'admin', label: t('WP Admin', { _tags: 'core' }) };
			}
		}
	}, [selected, stores, t]);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		({ value, label }) => {
			if (isString(value)) {
				query.where('meta_data', { $elemMatch: { key: '_pos_store', value: null } });
				query.where('created_via', value);
			} else {
				query.where('created_via', null);
				query.where('meta_data', {
					$elemMatch: { key: '_pos_store', value: String(value) },
				});
			}
		},
		[query]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.where('created_via', null);
		query.where('meta_data', { $elemMatch: { key: '_pos_store', value: null } });
	}, [query]);

	/**
	 *
	 */
	return (
		<Select value={value} onOpenChange={setOpen} onValueChange={handleSelect}>
			<SelectPrimitive.Trigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="shop"
					variant={isActive ? 'default' : 'muted'}
					onPress={() => setOpen(!open)}
					removable={isActive}
					onRemove={handleRemove}
				>
					<ButtonText>{value?.label || t('Created via', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</SelectPrimitive.Trigger>
			<SelectContent>
				<SelectGroup>
					<SelectLabel>{t('Created via', { _tags: 'core' })}</SelectLabel>
					<SelectItem value="woocommerce-pos" label={t('POS', { _tags: 'core' })}>
						{t('POS', { _tags: 'core' })}
					</SelectItem>
					<SelectItem value="checkout" label={t('Online Store', { _tags: 'core' })}>
						{t('Online Store', { _tags: 'core' })}
					</SelectItem>
					<SelectItem value="admin" label={t('WP Admin', { _tags: 'core' })}>
						{t('WP Admin', { _tags: 'core' })}
					</SelectItem>
				</SelectGroup>
				<SelectSeparator />
				<SelectGroup>
					<SelectLabel>{t('Store', { _tags: 'core' })}</SelectLabel>
					{(stores || []).map((store) => {
						return (
							<SelectItem key={store.id} value={store.id} label={store.name}>
								{store.name}
							</SelectItem>
						);
					})}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
};
