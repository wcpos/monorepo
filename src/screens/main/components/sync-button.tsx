import * as React from 'react';

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from '@wcpos/tailwind/src/context-menu';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/tailwind/src/dropdown-menu';
import { Icon } from '@wcpos/tailwind/src/icon';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Loader } from '@wcpos/tailwind/src/loader';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

import { useT } from '../../../contexts/translations';

interface SyncButtonProps {
	sync: () => Promise<null>;
	clear: () => Promise<null>;
	active: boolean;
}

const SyncButton = ({ sync, clear, active }: SyncButtonProps) => {
	const t = useT();
	const [open, setOpen] = React.useState(false);

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
	return active ? (
		<Loader size="sm" />
	) : (
		<DropdownMenu onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger onLongPress={() => setOpen(true)} onPress={sync} asChild>
					<IconButton name="arrowRotateRight" size="sm" />
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
