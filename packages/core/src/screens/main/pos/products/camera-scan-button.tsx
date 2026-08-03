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
					name="barcodeRead"
					variant={open ? 'primary' : 'default'}
					iconClassName={open ? 'text-primary' : undefined}
					onPress={onToggle}
					testID="camera-scan-button"
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>
					{open
						? t('pos_products.camera_scan_close', { defaultValue: 'Close barcode scanner' })
						: t('pos_products.camera_scan_open', { defaultValue: 'Scan barcode with camera' })}
				</Text>
			</TooltipContent>
		</Tooltip>
	);
}
