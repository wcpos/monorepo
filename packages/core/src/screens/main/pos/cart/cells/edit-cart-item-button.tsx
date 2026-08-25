import * as React from 'react';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
function EditCartItemButton({ title, children }: Props) {
	const [openDialog, setOpenDialog] = React.useState(false);

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<Tooltip>
					<TooltipTrigger asChild onPress={() => setOpenDialog(true)}>
						<IconButton name="ellipsisVertical" />
					</TooltipTrigger>
					{/* Every caller builds this title from a server-supplied name — a product,
					    a fee, a shipping method — so both places it renders decode. */}
					<TooltipContent>
						<Text decodeHtml>{title}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>
							<Text decodeHtml>{title}</Text>
						</DialogTitle>
					</DialogHeader>
					<DialogBody>{children}</DialogBody>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
}

export { EditCartItemButton };
