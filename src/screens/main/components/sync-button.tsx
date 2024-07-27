import * as React from 'react';

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from '@wcpos/tailwind/src/context-menu';
import { Icon } from '@wcpos/tailwind/src/icon';
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
		<Loader size="small" />
	) : (
		<ContextMenu>
			<ContextMenuTrigger>
				<Tooltip delayDuration={150}>
					<TooltipTrigger
						onLongPress={() => {
							console.log('test');
						}}
						onPress={sync}
					>
						<Icon name="arrowRotateRight" className="text-sm" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Press to sync, long press for more options', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
			</ContextMenuTrigger>
			<ContextMenuContent side="top" align="end">
				<ContextMenuItem onPress={sync}>
					<Icon name="arrowRotateRight" />
					<Text>{t('Sync', { _tags: 'core' })}</Text>
				</ContextMenuItem>
				<ContextMenuItem onPress={handleClearAndSync}>
					<Icon name="trash" />
					<Text>{t('Clear and Refresh', { _tags: 'core' })}</Text>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export default SyncButton;
