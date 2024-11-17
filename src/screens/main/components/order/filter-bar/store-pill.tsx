import * as React from 'react';

import isString from 'lodash/isString';
import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
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
	const selectedCreatedVia = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('created_via')))
	);
	/**
	 * Selected store ID as a string
	 */
	const selectedStoreID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getMetaDataElemMatchValue('_pos_store')))
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
	 * @NOTE - meta_data is used for _pos_user and _pos_store, so we need multipleElemMatch
	 */
	const handleSelect = React.useCallback(
		({ value, label }) => {
			if (isString(value)) {
				query
					.removeElemMatch('meta_data', { key: '_pos_store' })
					.where('created_via')
					.equals(value)
					.exec();
			} else {
				query
					.removeWhere('created_via')
					.removeElemMatch('meta_data', { key: '_pos_store' }) // clear any previous value
					.where('meta_data')
					.multipleElemMatch({ key: '_pos_store', value: String(value) })
					.exec();
			}
		},
		[query]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		query.removeWhere('created_via').removeElemMatch('meta_data', { key: '_pos_store' }).exec();
	}, [query]);

	/**
	 * Hide store section if there is only the default store
	 */
	let showStores = true;
	if (stores.length === 1 && stores[0].id === 0) {
		showStores = false;
	}

	/**
	 *
	 */
	return (
		<Select value={value} onOpenChange={setOpen} onValueChange={handleSelect}>
			<SelectPrimitiveTrigger asChild>
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
			</SelectPrimitiveTrigger>
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
				{showStores && (
					<>
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
					</>
				)}
			</SelectContent>
		</Select>
	);
};
