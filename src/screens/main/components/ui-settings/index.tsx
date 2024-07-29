import * as React from 'react';

import { Button } from '@wcpos/tailwind/src/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/tailwind/src/dialog';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Icon } from '@wcpos/tailwind/src/icon';
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
					<Button variant="ghost" className="rounded-full" onPress={() => setOpen(true)}>
						<Icon name="sliders" />
					</Button>
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
