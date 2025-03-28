import * as React from 'react';

import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
const AddCartItemButton = ({ title, children }: Props) => {
	return (
		<ErrorBoundary>
			<Dialog>
				<DialogTrigger asChild>
					<IconButton name="circlePlus" />
				</DialogTrigger>
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

export { AddCartItemButton };
