import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
	DialogFooter,
	DialogClose,
} from '@wcpos/components/src/dialog';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

import { useT } from '../../../../../contexts/translations';

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
const EditCartItemButton = ({ title, children }: Props) => {
	const [openDialog, setOpenDialog] = React.useState(false);
	const t = useT();

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
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Text>{title}</Text>
						</DialogTitle>
					</DialogHeader>
					<DialogBody>{children}</DialogBody>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="muted" onPress={() => setOpenDialog(false)}>
								<ButtonText>{t('Close', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};

export { EditCartItemButton };
