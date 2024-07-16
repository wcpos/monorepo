import * as React from 'react';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Loader from '@wcpos/components/src/loader';
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from '@wcpos/tailwind/src/context-menu';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

import { useT } from '../../../contexts/translations';

interface SyncButtonProps {
	sync: () => Promise<null>;
	clear: () => Promise<null>;
	active: boolean;
}

const SyncButton = ({ sync, clear, active }: SyncButtonProps) => {
	const [openMenu, setOpenMenu] = React.useState(false);
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
					<TooltipTrigger>
						<Icon
							name="arrowRotateRight"
							size="small"
							onPress={sync}
							onLongPress={() => setOpenMenu(true)}
							// tooltip={t('Press to sync, long press for more options', { _tags: 'core' })}
							// tooltipPlacement="top-end"
						/>
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Press to sync, long press for more options', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
			</ContextMenuTrigger>
			<ContextMenuContent align="end">
				<ContextMenuItem inset>
					<Text>{t('Sync', { _tags: 'core' })}</Text>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem inset>
					<Text>{t('Clear and Refresh', { _tags: 'core' })}</Text>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export default SyncButton;

/* // <Dropdown
// 	opened={openMenu}
// 	onClose={() => setOpenMenu(false)}
// 	placement="top-end"
// 	items={[
// 		{
// 			label: t('Sync', { _tags: 'core' }),
// 			action: sync,
// 			icon: 'arrowRotateRight',
// 		},
// 		{ label: '__' },
// 		{
// 			label: t('Clear and Refresh', { _tags: 'core' }),
// 			action: handleClearAndSync,
// 			type: 'critical',
// 			icon: 'trash',
// 		},
// 	]}
// 	trigger="longpress"
// >
// 	<Icon
// 		name="arrowRotateRight"
// 		size="small"
// 		onPress={sync}
// 		onLongPress={() => setOpenMenu(true)}
// 		tooltip={t('Press to sync, long press for more options', { _tags: 'core' })}
// 		tooltipPlacement="top-end"
// 	/>
// </Dropdown> */
