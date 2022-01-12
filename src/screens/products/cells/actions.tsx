import * as React from 'react';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import ProductModal from './modal';
import DeleteDialog from './delete-dialog';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const [showDialog, setShowDialog] = React.useState(false);
	const { ref: modalRef, open, close } = useModal();

	const handleSync = () => {
		const replicationState = product.syncRestApi({
			push: {},
		});
		replicationState.run(false);
	};

	const handleDelete = () => {
		product.remove();
	};

	return (
		<>
			<Dropdown
				items={[
					{ label: 'Space' },
					{ label: 'Space' },
					{ label: 'Show', action: open },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: () => setShowDialog(true), type: 'critical' },
				]}
			>
				<Icon name="ellipsisVertical" />
			</Dropdown>
			{showDialog && <DeleteDialog product={product} onClose={() => setShowDialog(false)} />}

			<Modal ref={modalRef} title={`Edit ${product.name}`}>
				<ProductModal product={product} />
			</Modal>
		</>
	);
};

export default Actions;
