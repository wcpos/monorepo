import * as React from 'react';

import { Dialog, DialogContent, DialogTrigger } from '@wcpos/tailwind/src/dialog';
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
	return (
		<ErrorBoundary>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<Dialog title={title}>
						<DialogTrigger asChild>
							<IconButton name="sliders" />
						</DialogTrigger>
						<DialogContent>{children}</DialogContent>
					</Dialog>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{title}</Text>
				</TooltipContent>
			</Tooltip>
		</ErrorBoundary>
	);
};
