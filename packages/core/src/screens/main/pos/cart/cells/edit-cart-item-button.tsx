import * as React from 'react';

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/tooltip';

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
const EditCartItemButton = ({ title, children }: Props) => {
	const [openDialog, setOpenDialog] = React.useState(false);

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<Tooltip>
					<TooltipTrigger asChild onPress={() => setOpenDialog(true)}>
						<IconButton name="ellipsisVertical" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{title}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>
					<DialogBody>{children}</DialogBody>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};

export { EditCartItemButton };
