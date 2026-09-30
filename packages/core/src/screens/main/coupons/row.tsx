import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { ActiveBadge } from './cells/active';
import { useT } from '../../../contexts/translations';
import { useStoreDayLabel } from '../../../hooks/use-store-day-label';
import { useProAccess } from '../contexts/pro-access';
import { useNumberFormat } from '../hooks/use-number-format';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

const typeLabels: Record<string, string> = {
	percent: 'coupons.percent_short',
	fixed_cart: 'coupons.fixed_cart_short',
	fixed_product: 'coupons.fixed_product_short',
};

export function CouponRow({ record }: { record: EngineRecord<'coupons'> }) {
	const coupon = useRecordField(record, ({ payload }) => payload);
	const { day } = useStoreDayLabel();
	const { format } = useNumberFormat({ fixedDecimalScale: true });
	const t = useT();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const router = useRouter();
	const editable = !readOnly && caps.canEditCoupons;
	const type = coupon.discount_type ?? 'percent';
	return (
		<Pressable
			testID={`coupons-row-${record.uuid}`}
			accessibilityRole={editable ? 'button' : undefined}
			onPress={
				editable
					? () =>
							router.push({
								pathname: '/coupons/edit/[couponId]',
								params: { couponId: record.uuid },
							})
					: undefined
			}
			className="border-border active:bg-muted min-h-14 flex-row items-center gap-3 border-b px-3"
		>
			<View className="min-w-0 flex-1 gap-1">
				<Text numberOfLines={1} className="font-semibold">
					{coupon.code}
				</Text>
				{!!coupon.description && (
					<Text numberOfLines={1} className="text-muted-foreground text-sm">
						{coupon.description}
					</Text>
				)}
				<Text numberOfLines={1} className="text-muted-foreground text-sm">
					{[
						typeLabels[type] ? t(typeLabels[type]) : type,
						format(Number(coupon.amount)),
						coupon.date_expires_gmt
							? `${t('coupons.expires')} ${day(coupon.date_expires_gmt)}`
							: null,
					]
						.filter(Boolean)
						.join(' · ')}
				</Text>
			</View>
			<ActiveBadge status={coupon.status} dateExpiresGmt={coupon.date_expires_gmt} />
			<Icon name="chevronRight" className="text-muted-foreground" />
		</Pressable>
	);
}
