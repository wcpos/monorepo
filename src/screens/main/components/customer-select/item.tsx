import * as React from 'react';

import { Avatar } from '@wcpos/components/src/avatar/avatar';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

export const CustomerItem = (customer: CustomerDocument, index: number) => {
	if (customer.id === 0) {
		return (
			<Box horizontal space="small">
				<Box>
					<Avatar
						size="small"
						source="https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
					/>
				</Box>
				<Box space="xSmall" fill>
					<Text>{t('Guest', { _tags: 'core' })}</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box horizontal space="small">
			<Box>
				<Avatar source={customer.avatar_url} size="small" />
			</Box>
			<Box space="xSmall" fill>
				<Box horizontal>
					<Text>
						{customer.first_name} {customer.last_name}
					</Text>
				</Box>
				<Box horizontal>
					<Text size="small" type="secondary">
						{customer.email}
					</Text>
				</Box>
				{(customer.company || customer.phone) && (
					<Box horizontal>
						<Text size="small" type="secondary">
							{customer.company} {customer.phone ? `• ${customer.phone}` : ''}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};
