import * as React from 'react';

import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { useModal } from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import EditModal from '../components/edit-document-form';
import usePushDocument from '../contexts/use-push-document';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductVariationDocument>;
}

/**
 *
 */
const EditVariation = ({ resource }: Props) => {
	const variation = useObservableSuspense(resource);
	const { setPrimaryAction, setTitle } = useModal();
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();
	const t = useT();

	if (!variation) {
		throw new Error(t('Variation not found', { _tags: 'core' }));
	}

	const manageStock = useObservableState(variation.manage_stock$, variation.manage_stock);

	/**
	 * Handle save button click
	 */
	const handleSave = React.useCallback(async () => {
		try {
			setPrimaryAction((prev) => {
				return {
					...prev,
					loading: true,
				};
			});
			const success = await pushDocument(variation);
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Variation {id} saved', { _tags: 'core', id: success.id }),
				});
			}
		} catch (error) {
			log.error(error);
		} finally {
			setPrimaryAction((prev) => {
				return {
					...prev,
					loading: false,
				};
			});
		}
	}, [setPrimaryAction, pushDocument, variation, addSnackbar, t]);

	/**
	 *
	 */
	React.useEffect(() => {
		setTitle(() => t('Edit Variation', { _tags: 'core', _context: 'Edit Variation title' }));
		setPrimaryAction({
			label: t('Save to Server', { _tags: 'core' }),
			action: handleSave,
		});
	}, [handleSave, setPrimaryAction, setTitle, t]);

	/**
	 *
	 */
	return (
		<EditModal
			document={variation}
			fields={[
				'status',
				'featured',
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
				status: {
					'ui:label': t('Status', { _tags: 'core' }),
				},
				featured: {
					'ui:label': t('Featured', { _tags: 'core' }),
				},
				sku: {
					'ui:label': t('SKU', { _tags: 'core' }),
				},
				barcode: {
					'ui:label': t('Barcode', { _tags: 'core' }),
				},
				price: {
					'ui:label': t('Price', { _tags: 'core' }),
				},
				regular_price: {
					'ui:label': t('Regular Price', { _tags: 'core' }),
				},
				sale_price: {
					'ui:label': t('Sale Price', { _tags: 'core' }),
				},
				on_sale: {
					'ui:label': t('On Sale', { _tags: 'core' }),
				},
				tax_status: {
					'ui:label': t('Tax Status', { _tags: 'core' }),
				},
				tax_class: {
					'ui:label': t('Tax Class', { _tags: 'core' }),
				},
				manage_stock: {
					'ui:label': t('Manage Stock', { _tags: 'core' }),
				},
				stock_quantity: {
					'ui:label': t('Stock Quantity', { _tags: 'core' }),
					// TODO: only show if manage_stock is true
					'ui:disabled': !manageStock,
				},
				meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data', { _tags: 'core' }) },
			}}
		/>
	);
};

export default EditVariation;
