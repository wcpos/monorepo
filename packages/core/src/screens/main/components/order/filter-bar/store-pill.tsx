import * as React from 'react';

import isString from 'lodash/isString';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectPrimitiveTrigger,
	SelectSeparator,
} from '@wcpos/components/select';
import type { OrderCollection, StoreDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';

interface Props {
	query: Query<OrderCollection>;
	resource: ObservableResource<StoreDocument[]>;
}

/**
 *
 */
export function StorePill({ resource, query }: Props) {
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
	const value = React.useMemo((): { value: string; label: string } | undefined => {
		const number = Number(selected);
		if (Number.isInteger(number) && !isNaN(number)) {
			const store = (stores || []).find((s) => s.id === number);
			if (store) {
				return { value: String(number), label: store.name ?? '' };
			}
			return undefined;
		} else {
			switch (selected as unknown as string) {
				case 'woocommerce-pos':
					return { value: 'woocommerce-pos', label: t('common.pos') };
				case 'checkout':
					return { value: 'checkout', label: t('common.online_store') };
				case 'admin':
					return { value: 'admin', label: t('common.wp_admin') };
			}
		}
		return undefined;
	}, [selected, stores, t]);

	/**
	 * @NOTE - meta_data is used for _pos_user and _pos_store, so we need multipleElemMatch
	 */
	const handleSelect = React.useCallback(
		(option: { value: string; label: string } | undefined) => {
			if (!option) return;
			const { value } = option;
			// Store IDs are numeric strings, while created_via values are alphabetic
			const numericValue = Number(value);
			if (Number.isInteger(numericValue) && !isNaN(numericValue)) {
				query
					.removeWhere('created_via')
					.removeElemMatch('meta_data', { key: '_pos_store' }) // clear any previous value
					.where('meta_data')
					.multipleElemMatch({ key: '_pos_store', value: String(value) })
					.exec();
			} else {
				query
					.removeElemMatch('meta_data', { key: '_pos_store' })
					.where('created_via')
					.equals(value)
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
					variant={isActive ? undefined : 'muted'}
					onPress={() => setOpen(!open)}
					removable={isActive}
					onRemove={handleRemove}
				>
					<ButtonText>{value?.label || t('common.created_via_2')}</ButtonText>
				</ButtonPill>
			</SelectPrimitiveTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectLabel>{t('common.created_via_2')}</SelectLabel>
					<SelectItem value="woocommerce-pos" label={t('common.pos')}>
						{t('common.pos')}
					</SelectItem>
					<SelectItem value="checkout" label={t('common.online_store')}>
						{t('common.online_store')}
					</SelectItem>
					<SelectItem value="admin" label={t('common.wp_admin')}>
						{t('common.wp_admin')}
					</SelectItem>
				</SelectGroup>
				{showStores && (
					<>
						<SelectSeparator />
						<SelectGroup>
							<SelectLabel>{t('common.store')}</SelectLabel>
							{(stores || []).map((store) => {
								return (
									<SelectItem
										key={store.id}
										value={String(store.id ?? '')}
										label={store.name ?? ''}
									>
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
}
