import * as React from 'react';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import ProductModal from './modal';
import DeleteDialog from './delete-dialog';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const [visible, setVisible] = React.useState(false);
	const [showDialog, setShowDialog] = React.useState(false);

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
					{ label: 'Show', action: () => setVisible(true) },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: () => setShowDialog(true), type: 'critical' },
				]}
				activator={<Icon name="more" />}
			/>
			{showDialog && <DeleteDialog product={product} onClose={() => setShowDialog(false)} />}
			{visible && <ProductModal product={product} onClose={() => setVisible(false)} />}
		</>
	);
};

export default Actions;
