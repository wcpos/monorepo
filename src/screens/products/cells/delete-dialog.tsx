import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import Text from '@wcpos/common/src/components/text';

type ProductModalProps = {
	product: import('@wcpos/common/src/database').ProductDocument;
	onClose: () => void;
};

const DeleteDialog = ({ product, onClose }: ProductModalProps) => {
	return (
		<Dialog
			title="Confirm"
			open
			onClose={onClose}
			primaryAction={{
				label: 'Delete',
				action: () => {
					console.log('delete locally and on server');
				},
				type: 'critical',
			}}
			secondaryActions={[
				{ label: 'Delete locally', action: product.remove },
				{ label: 'Cancel', action: onClose },
			]}
		>
			<Dialog.Section>
				<Text>You are about to delete {product.name}</Text>
			</Dialog.Section>
		</Dialog>
	);
};

export default DeleteDialog;
