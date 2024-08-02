import * as React from 'react';

import { Dialog, DialogContent, DialogTitle } from '@wcpos/tailwind/src/dialog';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/tailwind/src/tooltip';

import { useT } from '../../../../contexts/translations';
import { UISettingID, UISettingState, useUISettings } from '../../contexts/ui-settings';

interface Props<T extends UISettingID> {
	uiSettings: UISettingState<T>;
	title: string;
}

export const UISettings = <T extends UISettingID>({ uiSettings, title }: Props<T>) => {
	const [open, setOpen] = React.useState(false);
	const t = useT();

	return (
		<ErrorBoundary>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<IconButton name="sliders" onPress={() => setOpen(true)} />
				</TooltipTrigger>
				<TooltipContent>
					<Text>{title}</Text>
				</TooltipContent>
			</Tooltip>
			<Dialog open={open} onOpenChange={setOpen}>
				{/* <DialogTitle>{t('Add new customer', { _tags: 'core' })}</DialogTitle> */}
				<DialogContent>{title}</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};
