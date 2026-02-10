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

export interface SyncButtonProps {
	sync: () => Promise<void>;
	clearAndSync: () => Promise<void>;
	active: boolean;
}

export function SyncButton({ sync, clearAndSync, active }: SyncButtonProps) {
	const t = useT();
	const triggerRef = React.useRef<{ open?: () => void }>(null);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				// @ts-expect-error: ref only needs open() but TriggerRef requires full PressableRef
				ref={triggerRef}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<IconButton
						name="arrowRotateRight"
						size="sm"
						loading={active}
						onLongPress={() => {
							triggerRef.current?.open?.();
						}}
						onPress={() => {
							sync();
						}}
					/>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{t('common.press_to_sync_long_press_for')}</Text>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="top" align="end">
				<DropdownMenuItem onPress={sync}>
					<Icon name="arrowRotateRight" />
					<Text>{t('common.sync')}</Text>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onPress={clearAndSync}>
					<Icon name="trash" />
					<Text>{t('common.clear_and_refresh')}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
