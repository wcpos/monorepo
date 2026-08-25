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
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useGuardedExtension, useSearchSelect } from '../../../../query';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useAddCoupon } from '../hooks/use-add-coupon';

import type { SearchSelectBinding } from '../../../../query';

interface CouponHit {
	id: string;
	record: EngineRecord<'coupons'>;
}

type CouponPayload = EngineRecord<'coupons'>['payload'];

export function AddCoupon() {
	const t = useT();
	const { addCoupon } = useAddCoupon();
	const { onOpenChange } = useRootContext();
	const [error, setError] = React.useState<string | null>(null);
	const [selected, setSelected] = React.useState<CouponPayload | null>(null);
	const [isApplying, setIsApplying] = React.useState(false);

	const handleValueChange = React.useCallback(
		(option: { value: string; label: string; item?: CouponPayload } | undefined) => {
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
				setError(result.error || t('pos_cart.failed_to_apply_coupon'));
			}
		} finally {
			setIsApplying(false);
		}
	}, [selected, isApplying, addCoupon, onOpenChange, t]);

	return (
		<VStack className="gap-4">
			{error && <Text className="text-destructive">{error}</Text>}
			<Combobox onValueChange={handleValueChange}>
				<ComboboxTrigger testID="add-coupon-combobox">
					<ComboboxValue placeholder={t('pos_cart.select_coupon')} />
				</ComboboxTrigger>
				<ComboboxContent
					portalHost="pos"
					{...(Platform.OS === 'web'
						? ({ style: { width: 'var(--radix-popover-trigger-width)' } } as any)
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
					{t('common.apply')}
				</DialogAction>
			</DialogFooter>
		</VStack>
	);
}

function CouponSearch({ onSearchChange }: { onSearchChange?: () => void }) {
	const t = useT();
	const binding = useSearchSelect('coupon');

	const onSearch = React.useCallback(
		(value: string) => {
			binding.setSearch(value);
			onSearchChange?.();
		},
		[binding.setSearch, onSearchChange]
	);

	return (
		<>
			<ComboboxInput
				testID="add-coupon-search-input"
				placeholder={t('pos_cart.search_coupons')}
				value={binding.search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CouponList binding={binding} />
			</Suspense>
		</>
	);
}

function CouponList({ binding }: { binding: SearchSelectBinding }) {
	const result = useObservableSuspense(binding.resource) as { hits: CouponHit[] };
	const t = useT();
	const handleEndReached = useGuardedExtension(
		binding.extendLimit,
		result.hits.length,
		binding.limit
	);

	return (
		<ComboboxList
			data={result.hits as unknown as import('@wcpos/components/combobox').Option[]}
			shouldFilter={false}
			onEndReached={handleEndReached}
			onEndReachedThreshold={0.1}
			renderItem={({ item }) => {
				const hit = item as unknown as CouponHit;
				const coupon = hit.record.payload;
				return (
					<ComboboxItem
						testID={`add-coupon-option-${coupon.id}`}
						value={String(coupon.id)}
						label={coupon.code ?? ''}
						item={coupon}
					>
						<CouponItemContent coupon={coupon} />
					</ComboboxItem>
				);
			}}
			estimatedItemSize={52}
			ListEmptyComponent={<ComboboxEmpty>{t('pos_cart.no_coupons_found')}</ComboboxEmpty>}
		/>
	);
}

function CouponItemContent({ coupon }: { coupon: CouponPayload }) {
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
				return t('pos_cart.percentage_discount');
			case 'fixed_cart':
				return t('pos_cart.fixed_cart_discount');
			case 'fixed_product':
				return t('pos_cart.fixed_product_discount');
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
