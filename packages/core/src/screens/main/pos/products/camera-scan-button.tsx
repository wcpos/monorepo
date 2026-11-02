import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../contexts/translations';

interface CameraScanButtonProps {
	open: boolean;
	onToggle: () => void;
}

/** Toggles the inline camera scanning panel (#905). */
export function CameraScanButton({ open, onToggle }: CameraScanButtonProps) {
	const t = useT();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					name="scan"
					on={open}
					accessibilityLabel={
						open ? t('pos_products.camera_scan_close') : t('pos_products.camera_scan_open')
					}
					onPress={onToggle}
					testID="camera-scan-button"
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>
					{open ? t('pos_products.camera_scan_close') : t('pos_products.camera_scan_open')}
				</Text>
			</TooltipContent>
		</Tooltip>
	);
}
