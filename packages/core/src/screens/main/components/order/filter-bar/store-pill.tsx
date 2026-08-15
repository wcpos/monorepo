import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

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
import type { StoreDocument } from '@wcpos/database';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';

interface Props {
	resource: ObservableResource<StoreDocument[]>;
}

/**
 *
 */
export function StorePill({ resource }: Props) {
	const stores = useObservableSuspense(resource);
	const selected = useQueryState<'orders', string | number | undefined>(
		(state) => state.filters.store
	);
	const actions = useQueryStateActions<'orders'>();
	const t = useT();
	const isActive = selected !== undefined && selected !== null && selected !== '';
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

	const handleSelect = React.useCallback(
		(option: { value: string; label: string } | undefined) => {
			if (!option) return;
			actions.setFilter('store', option.value);
		},
		[actions]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		actions.clearFilter('store');
	}, [actions]);

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
