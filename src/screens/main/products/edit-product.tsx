import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { useModal } from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../lib/translations';
import EditModal from '../components/form-with-json';
import useProducts from '../contexts/products';
import usePushDocument from '../contexts/use-push-document';

const EditProduct = () => {
	const { data } = useProducts();
	const product = data.length === 1 && data[0];
	const { onPrimaryAction, setTitle } = useModal();
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();

	if (!product) {
		throw new Error(t('Product not found', { _tags: 'core' }));
	}

	const name = useObservableState(product.name$, product.name);

	React.useEffect(() => {
		setTitle(() => t('Edit {name}', { _tags: 'core', name, _context: 'Edit Product title' }));
	}, [name, setTitle]);

	/**
	 * Handle save button click
	 */
	onPrimaryAction(async () => {
		console.log('FIXME: this triggers twice!');
		try {
			const success = await pushDocument(product);
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Product {id} saved', { _tags: 'core', id: success.id }),
				});
			}
		} catch (error) {
			log.error(error);
		}
	});

	return (
		<EditModal
			document={product}
			fields={[
				'name',
				'status',
				// 'description',
				// 'short_description',
				'sku',
				'barcode',
				'price',
				'regular_price',
				'sale_price',
				// 'date_on_sale_from',
				// 'date_on_sale_to',
				'on_sale',
				'tax_status',
				'tax_class',
				'manage_stock',
				'stock_quantity',
				// 'low_stock_amount',
				// 'weight',
				// 'dimensions',
				// 'categories',
				// 'tags',
				'meta_data',
			]}
			uiSchema={{
				'ui:title': null,
				'ui:description': null,
				meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data', { _tags: 'core' }) },
			}}
		/>
	);
};

export default EditProduct;
