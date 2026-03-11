import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { Platform } from '@wcpos/utils/platform';
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';
import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CouponDocument } from '@wcpos/database';
import { useQuery } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useAddCoupon } from '../hooks/use-add-coupon';

interface CouponHit {
	id: string;
	document: CouponDocument;
}

export function AddCoupon() {
	const t = useT();
	const { addCoupon } = useAddCoupon();
	const { onOpenChange } = useRootContext();
	const [error, setError] = React.useState<string | null>(null);
	const [selected, setSelected] = React.useState<CouponDocument | null>(null);
	const [isApplying, setIsApplying] = React.useState(false);

	const handleValueChange = React.useCallback(
		(option: { value: string; label: string; item?: CouponDocument } | undefined) => {
			setSelected(option?.item ?? null);
			setError(null);
		},
		[]
	);

	const handleApply = React.useCallback(async () => {
		if (!selected || isApplying) return;
		setIsApplying(true);
		setError(null);
		try {
			const result = await addCoupon(selected.code ?? '');
			if (result.success) {
				onOpenChange(false);
			} else {
				setError(
					result.error ||
						t('pos_cart.failed_to_apply_coupon', {
							defaultValue: 'Failed to apply coupon.',
						})
				);
			}
		} finally {
			setIsApplying(false);
		}
	}, [selected, isApplying, addCoupon, onOpenChange, t]);

	return (
		<VStack className="gap-4">
			{error && <Text className="text-destructive">{error}</Text>}
			<Combobox onValueChange={handleValueChange}>
				<ComboboxTrigger>
					<ComboboxValue
						placeholder={t('pos_cart.select_coupon', { defaultValue: 'Select coupon...' })}
					/>
				</ComboboxTrigger>
				<ComboboxContent
					portalHost="pos"
					{...(Platform.OS === 'web'
						? { style: { width: 'var(--radix-popover-trigger-width)' } }
						: {})}
				>
					<CouponSearch onSearchChange={() => setError(null)} />
				</ComboboxContent>
			</Combobox>
			<DialogFooter className="px-0">
				<DialogClose>{t('common.cancel')}</DialogClose>
				<DialogAction
					testID="add-coupon-submit"
					onPress={handleApply}
					disabled={!selected || isApplying}
				>
					{t('common.apply', { defaultValue: 'Apply' })}
				</DialogAction>
			</DialogFooter>
		</VStack>
	);
}

function CouponSearch({ onSearchChange }: { onSearchChange?: () => void }) {
	const t = useT();
	const [search, setSearch] = React.useState('');

	const query = useQuery({
		queryKeys: ['coupons', 'coupon-select'],
		collectionName: 'coupons',
		initialParams: {
			sort: [{ code: 'asc' }],
		},
		infiniteScroll: true,
	});

	const onSearch = React.useCallback(
		(value: string) => {
			setSearch(value);
			onSearchChange?.();
			query?.debouncedSearch(value);
		},
		[onSearchChange, query]
	);

	React.useEffect(() => {
		return () => query?.search('');
	}, [query]);

	return (
		<>
			<ComboboxInput
				placeholder={t('pos_cart.search_coupons', { defaultValue: 'Search coupons...' })}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CouponList query={query} />
			</Suspense>
		</>
	);
}

function CouponList({ query }: { query: any }) {
	const result = useObservableSuspense(query.resource) as { hits: CouponHit[] };
	const t = useT();

	return (
		<ComboboxList
			data={result.hits as unknown as import('@wcpos/components/combobox').Option[]}
			shouldFilter={false}
			onEndReached={() => {
				if (query?.infiniteScroll) {
					query.loadMore();
				}
			}}
			renderItem={({ item }) => {
				const hit = item as unknown as CouponHit;
				return (
					<ComboboxItem
						value={String(hit.document.id)}
						label={hit.document.code ?? ''}
						item={hit.document}
					>
						<CouponItemContent coupon={hit.document} />
					</ComboboxItem>
				);
			}}
			estimatedItemSize={52}
			ListEmptyComponent={
				<ComboboxEmpty>
					{t('pos_cart.no_coupons_found', { defaultValue: 'No coupons found' })}
				</ComboboxEmpty>
			}
		/>
	);
}

function CouponItemContent({ coupon }: { coupon: CouponDocument }) {
	const t = useT();
	const { format } = useCurrencyFormat();

	const amountLabel = React.useMemo(() => {
		if (!coupon.amount || coupon.amount === '0') return null;
		switch (coupon.discount_type) {
			case 'percent':
				return `${coupon.amount}%`;
			case 'fixed_cart':
			case 'fixed_product':
				return format(parseFloat(coupon.amount));
			default:
				return null;
		}
	}, [coupon.amount, coupon.discount_type, format]);

	const typeLabel = React.useMemo(() => {
		switch (coupon.discount_type) {
			case 'percent':
				return t('pos_cart.percentage_discount', { defaultValue: 'Percentage discount' });
			case 'fixed_cart':
				return t('pos_cart.fixed_cart_discount', { defaultValue: 'Fixed cart discount' });
			case 'fixed_product':
				return t('pos_cart.fixed_product_discount', { defaultValue: 'Fixed product discount' });
			default:
				return '';
		}
	}, [coupon.discount_type, t]);

	return (
		<HStack className="flex-1 items-center justify-between">
			<VStack className="flex-1 gap-0.5">
				<Text className="text-sm font-medium">{coupon.code}</Text>
				{coupon.description ? (
					<Text className="text-muted-foreground text-xs" numberOfLines={1}>
						{coupon.description}
					</Text>
				) : (
					<Text className="text-muted-foreground text-xs">{typeLabel}</Text>
				)}
			</VStack>
			{amountLabel && (
				<Text className="text-primary ml-2 text-sm font-semibold">{amountLabel}</Text>
			)}
		</HStack>
	);
}
