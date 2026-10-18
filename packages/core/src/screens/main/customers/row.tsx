import * as React from 'react';

import { useRouter } from 'expo-router';

import { Icon } from '@wcpos/components/icon';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { GUEST_CUSTOMER_ID } from '@wcpos/sync-core';

import { useProAccess } from '../contexts/pro-access';
import { RecordAvatar } from '../components/user-avatar';
import { getCustomerAvatarName } from '../components/user-avatar/customer-avatar';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

export function CustomerRow({ record }: { record: EngineRecord<'customers'> }) {
	const customer = useRecordField(record, ({ payload }) => payload);
	const { format } = useCustomerNameFormat();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const router = useRouter();
	const editable = !readOnly && caps.canEditCustomers;
	return (
		<ListRow
			testID={`customers-row-${record.uuid}`}
			onPress={
				editable
					? () =>
							router.push({
								pathname: '/customers/edit/[customerId]',
								params: { customerId: record.uuid },
							})
					: undefined
			}
			leading={
				<RecordAvatar
					record={record}
					avatarUrl={customer.avatar_url}
					name={getCustomerAvatarName(customer)}
					size="lg"
					recyclingKey={record.uuid}
				/>
			}
			trailing={
				<>
					<Text numberOfLines={1} className="text-muted-foreground max-w-1/3 text-sm">
						{[customer.billing?.city, customer.billing?.country].filter(Boolean).join(', ')}
					</Text>
					<Icon name="chevronRight" className="text-muted-foreground" />
				</>
			}
		>
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
		</ListRow>
	);
}
