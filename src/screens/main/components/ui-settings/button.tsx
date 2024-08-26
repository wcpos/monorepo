import * as React from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/src/dialog';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

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
