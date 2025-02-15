import * as React from 'react';

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from '@wcpos/components/context-menu';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../contexts/translations';

interface SyncButtonProps {
	sync: () => Promise<null>;
	clear: () => Promise<null>;
	active: boolean;
}

const SyncButton = ({ sync, clear, active }: SyncButtonProps) => {
	const t = useT();
	const triggerRef = React.useRef(null);

	/**
	 *
	 */
	const handleClearAndSync = React.useCallback(async () => {
		await clear();
		// await sync(); // this sync function is going to be stale after clear
	}, [clear]);

	/**
	 *
	 */
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
				<DropdownMenuItem variant="destructive" onPress={handleClearAndSync}>
					<Icon name="trash" />
					<Text>{t('Clear and Refresh', { _tags: 'core' })}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default SyncButton;
