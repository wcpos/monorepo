import * as React from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/v2/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Button } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../../contexts/translations';
import { usePanelSide } from '../../contexts/overlay-side/v2';

interface Props {
	title: string;
	trigger?: 'icon' | 'label';
	children: React.ReactNode;
}

/**
 *
 */
function EditCartItemButton({ title, children, trigger = 'icon' }: Props) {
	const t = useT();
	const side = usePanelSide('cart');
	const [openDialog, setOpenDialog] = React.useState(false);

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				{trigger === 'label' ? (
					// A square block the height of the cart row it sits under (the line strip).
					<Button
						variant="secondary"
						className="min-w-tile h-auto flex-1 rounded-none px-5"
						testID="cart-line-edit"
						onPress={() => setOpenDialog(true)}
					>
						{t('pos_cart.edit_line')}
					</Button>
				) : (
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
				)}
				<DialogContent side={side} size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>
							<Text decodeHtml>{title}</Text>
						</DialogTitle>
					</DialogHeader>
					{children}
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
}

export { EditCartItemButton };
