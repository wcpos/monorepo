import * as React from 'react';

import { Avatar } from '@wcpos/components/src/avatar';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectItemProps {
	customer: CustomerDocument;
}

export const CustomerSelectItem = ({ customer }: CustomerSelectItemProps) => {
	const t = useT();

	if (customer.id === 0) {
		return (
			<HStack className="items-center">
				<Avatar
					source="https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
					recyclingKey="guest"
				/>
				<Text className="flex-1">{t('Guest', { _tags: 'core' })}</Text>
			</HStack>
		);
	} else {
		return (
			<HStack className="items-start">
				<Avatar source={customer.avatar_url} recyclingKey={customer.uuid} />
				<VStack space="sm">
					<Text>
						{customer.first_name} {customer.last_name}
					</Text>

					<Text className="text-sm">{customer.email}</Text>
					{(customer.company || customer.phone) && (
						<Text className="text-sm">
							{customer.company} {customer.phone ? `• ${customer.phone}` : ''}
						</Text>
					)}
				</VStack>
			</HStack>
		);
	}
};
