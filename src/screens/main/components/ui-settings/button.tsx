import * as React from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/tailwind/src/dialog';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/tailwind/src/tooltip';

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
export const UISettingsButton = ({ title, children }: Props) => {
	const [openDialog, setOpenDialog] = React.useState(false);

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<Tooltip delayDuration={150}>
					<TooltipTrigger asChild onPress={() => setOpenDialog(true)}>
						<IconButton name="sliders" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{title}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Text>{title}</Text>
						</DialogTitle>
					</DialogHeader>
					{children}
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};
