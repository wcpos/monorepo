import * as React from 'react';

import { Dialog } from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Button } from '@wcpos/components/button';

import { useT } from '../../../../../contexts/translations';
import { RecordDialog } from '../../../components/record-dialog';
import { usePanelSide } from '../../contexts/overlay-side';

interface Props {
	title: string;
	/** The cart line: the record the form edits and what the JSON tab shows. */
	item: object;
	form: React.ReactNode;
}

/** The line strip's Edit block and the record dialog it opens on the line. */
function EditCartItemButton({ title, item, form }: Props) {
	const t = useT();
	const side = usePanelSide('cart');
	const [openDialog, setOpenDialog] = React.useState(false);

	return (
		<ErrorBoundary>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				{/* A square block the height of the cart row it sits under (the line strip).
				    The slot under it paints the block's grey (line-strip.tsx). */}
				<Button
					variant="ghost"
					// eslint-disable-next-line no-restricted-syntax
					className="min-w-tile h-auto flex-1 rounded-none px-5"
					testID="cart-line-edit"
					onPress={() => setOpenDialog(true)}
				>
					{t('pos_cart.edit_line')}
				</Button>
				<RecordDialog
					side={side}
					portalHost="pos"
					title={title}
					record={item}
					form={() => form}
					payload={item}
				/>
			</Dialog>
		</ErrorBoundary>
	);
}

export { EditCartItemButton };
