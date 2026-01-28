import * as React from 'react';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../contexts/translations';

interface SyncButtonProps {
	sync: () => Promise<void>;
	clearAndSync: () => Promise<void>;
	active: boolean;
}

const SyncButton = ({ sync, clearAndSync, active }: SyncButtonProps) => {
	const t = useT();
	const triggerRef = React.useRef(null);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger ref={triggerRef} />
			<Tooltip>
				<TooltipTrigger asChild>
					<IconButton
						name="arrowRotateRight"
						size="sm"
						loading={active}
						onLongPress={() => {
							triggerRef.current?.open();
						}}
						onPress={() => {
							sync();
						}}
					/>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{t('Press to sync, long press for more options', { _tags: 'core' })}</Text>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="top" align="end">
				<DropdownMenuItem onPress={sync}>
					<Icon name="arrowRotateRight" />
					<Text>{t('Sync', { _tags: 'core' })}</Text>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onPress={clearAndSync}>
					<Icon name="trash" />
					<Text>{t('Clear and Refresh', { _tags: 'core' })}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default SyncButton;
