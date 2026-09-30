import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Icon } from '@wcpos/components/icon';
import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { GUEST_CUSTOMER_ID } from '@wcpos/sync-core';

import { useProAccess } from '../contexts/pro-access';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { useImageAttachment } from '../hooks/use-image-attachment';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

export function CustomerRow({ record }: { record: EngineRecord<'customers'> }) {
	const customer = useRecordField(record, ({ payload }) => payload);
	const { format } = useCustomerNameFormat();
	const { uri } = useImageAttachment(record, customer.avatar_url ?? '');
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const router = useRouter();
	const editable = !readOnly && caps.canEditCustomers;
	return (
		<Pressable
			testID={`customers-row-${record.uuid}`}
			accessibilityRole={editable ? 'button' : undefined}
			onPress={
				editable
					? () =>
							router.push({
								pathname: '/customers/edit/[customerId]',
								params: { customerId: record.uuid },
							})
					: undefined
			}
			className="border-border active:bg-muted min-h-14 flex-row items-center gap-3 border-b px-3"
		>
			<Image source={{ uri }} recyclingKey={record.uuid} className="size-10 rounded-full" />
			<View className="min-w-0 flex-1">
				<Text numberOfLines={1}>
					{format({
						id: GUEST_CUSTOMER_ID,
						first_name: customer.first_name,
						last_name: customer.last_name,
						email: customer.email,
					})}
				</Text>
				<Text
					testID={customer.email ? `customer-email-${customer.email}` : undefined}
					numberOfLines={1}
					className="text-muted-foreground text-sm"
				>
					{customer.email}
				</Text>
			</View>
			<Text numberOfLines={1} className="text-muted-foreground max-w-1/3 text-sm">
				{[customer.billing?.city, customer.billing?.country].filter(Boolean).join(', ')}
			</Text>
			<Icon name="chevronRight" className="text-muted-foreground" />
		</Pressable>
	);
}
