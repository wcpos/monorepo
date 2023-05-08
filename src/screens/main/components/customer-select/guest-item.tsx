import * as React from 'react';

import { Avatar } from '@wcpos/components/src/avatar/avatar';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';
const GuestCustomerSelectItem = () => {
	return (
		<Box horizontal space="small" fill>
			<Box>
				<Avatar
					size="small"
					source="https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
					recyclingKey="guest"
				/>
			</Box>
			<Box space="xSmall" fill>
				<Text>{t('Guest', { _tags: 'core' })}</Text>
			</Box>
		</Box>
	);
};

export default GuestCustomerSelectItem;
