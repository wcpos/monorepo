import * as React from 'react';

import pick from 'lodash/pick';

import Dialog, { useDialog } from '@wcpos/components/src/dialog';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../../../hooks/use-rest-http-client';
import EditForm from '../../common/edit-form';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const [modalOpened, setModalOpened] = React.useState(false);
	const { ref: dialogRef, open: dialogOpen } = useDialog();
	const http = useRestHttpClient();
	const [menuOpened, setMenuOpened] = React.useState(false);

	/**
	 *
	 */
	const handleSync = React.useCallback(() => {
		// could use the link url?
		http
			.get(`/products/${product._id}`)
			.then(({ data }) => {
				product.atomicPatch(data);
			})
			.catch((err) => {
				log.error(err);
			});
	}, [http, product]);

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
				'tax_status',
				'tax_class',
			]),
		};
	}, [product.collection.schema.jsonSchema]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				opened={menuOpened}
				onClose={() => {
					setMenuOpened(false);
				}}
				withinPortal={true}
				placement="bottom-end"
				items={[
					{
						label: 'Edit',
						action: () => {
							setModalOpened(true);
						},
						icon: 'penToSquare',
					},
					{ label: 'Sync', action: handleSync, icon: 'arrowRotateRight' },
					{ label: '__' },
					{ label: 'Delete', action: dialogOpen, icon: 'trash', type: 'critical' },
				]}
			>
				<Icon
					name="ellipsisVertical"
					onPress={() => {
						setMenuOpened(true);
					}}
				/>
			</Dropdown>

			<Dialog ref={dialogRef} onClose={handleDelete}>
				<Text>You are about to delete {product.name}</Text>
			</Dialog>

			<Modal
				opened={modalOpened}
				onClose={() => {
					setModalOpened(false);
				}}
				title={`Edit ${product.name}`}
				primaryAction={{
					label: 'Save',
					action: () => {
						console.log('save');
					},
				}}
				secondaryActions={[
					{
						label: 'Cancel',
						action: () => {
							setModalOpened(false);
						},
					},
				]}
			>
				<EditForm item={product} schema={schema} uiSchema={{}} />
			</Modal>
		</>
	);
};

export default Actions;
