import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';

import { Online } from './online';
import { UserMenu } from './user-menu';

export function HeaderRight() {
	return (
		<HStack className="gap-0">
			<Online />
			<UserMenu />
		</HStack>
	);
}
