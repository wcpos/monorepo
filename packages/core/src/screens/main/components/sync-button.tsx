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
	clearAndSync?: () => Promise<void>;
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
			<Tooltip showOnNative>
				<TooltipTrigger asChild>
					{/* The caption row's one control, at the row's height: 6 units (24 at Regular,
					    the `fine` pointer floor in scale.ts; WCAG 2.2 target minimum), and its 12 hitSlop
					    keeps the 44 touch target (owner, 2026-10-23: the band under the card). */}
					<IconButton
						name="refresh"
						size="xs"
						// The refresh glyph turns while the engine pulls and rests upright when it is done:
						// the glyph is the motion, so swapping it for the Loader's arc jarred on every
						// sync (owner, 2026-10-23).
						spin={active}
						accessibilityLabel={
							clearAndSync ? t('common.press_to_sync_long_press_for') : t('common.sync')
						}
						onLongPress={clearAndSync ? () => triggerRef.current?.open?.() : undefined}
						onPress={() => {
							void sync();
						}}
					/>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{clearAndSync ? t('common.press_to_sync_long_press_for') : t('common.sync')}</Text>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="top" align="end">
				<DropdownMenuItem onPress={sync}>
					<Icon name="refresh" />
					<Text>{t('common.sync')}</Text>
				</DropdownMenuItem>
				{clearAndSync && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onPress={clearAndSync}>
							<Icon name="delete" />
							<Text>{t('common.clear_and_refresh')}</Text>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
