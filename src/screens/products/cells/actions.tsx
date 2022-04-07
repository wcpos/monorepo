import * as React from 'react';
import pick from 'lodash/pick';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Icon from '@wcpos/common/src/components/icon';
import Text from '@wcpos/common/src/components/text';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import Dialog, { useDialog } from '@wcpos/common/src/components/dialog';
import EditModal from '../../common/edit-modal';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const { ref: modalRef, open, close } = useModal();
	const { ref: dialogRef, open: dialogOpen } = useDialog();

	/**
	 *
	 */
	const handleSync = () => {
		const replicationState = product.syncRestApi({
			push: {},
		});
		replicationState.run(false);
	};

	/**
	 *
	 */
	const handleDelete = React.useCallback(
		(confirm) => {
			if (confirm) {
				product.remove();
			}
		},
		[product]
	);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		return {
			...product.collection.schema.jsonSchema,
			properties: pick(product.collection.schema.jsonSchema.properties, [
				'name',
				'sku',
				'stock_quantity',
				'manage_stock',
			]),
		};
	}, [product.collection.schema.jsonSchema]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				items={[
					{ label: 'Show', action: open },
					{ label: 'Sync', action: handleSync },
					{ label: 'Delete', action: dialogOpen, type: 'critical' },
				]}
			>
				<Icon name="ellipsisVertical" />
			</Dropdown>

			<Dialog ref={dialogRef} onClose={handleDelete}>
				<Text>You are about to delete {product.name}</Text>
			</Dialog>

			<Modal ref={modalRef} title={`Edit ${product.name}`}>
				<EditModal item={product} schema={schema} uiSchema={{}} />
			</Modal>
		</>
	);
};

export default Actions;
