import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { useModal } from '@wcpos/components/src/modal';
import { Toast } from '@wcpos/tailwind/src/toast';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { EditDocumentForm } from '../components/edit-document-form';
import { TaxClassSelect } from '../components/tax-class-select';
import usePushDocument from '../contexts/use-push-document';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductVariationDocument>;
}

const fields = [
	'status',
	'featured',
	// 'description',
	// 'short_description',
	'sku',
	'barcode',
	// 'price',
	// 'regular_price',
	// 'sale_price',
	// 'date_on_sale_from',
	// 'date_on_sale_to',
	// 'on_sale',
	'tax_status',
	'tax_class',
	// 'manage_stock',
	// 'stock_quantity',
	// 'low_stock_amount',
	// 'weight',
	// 'dimensions',
	// 'categories',
	// 'tags',
	'meta_data',
];

/**
 *
 */
const EditVariation = ({ resource }: Props) => {
	const variation = useObservableSuspense(resource);
	const { setPrimaryAction, setTitle } = useModal();
	const pushDocument = usePushDocument();
	const t = useT();

	if (!variation) {
		throw new Error(t('Variation not found', { _tags: 'core' }));
	}

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
				Toast.show({
					text1: t('Variation {id} saved', { _tags: 'core', id: success.id }),
					type: 'success',
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
	}, [setPrimaryAction, pushDocument, variation, t]);

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
	const uiSchema = React.useMemo(
		() => ({
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
			tax_status: {
				'ui:label': t('Tax Status', { _tags: 'core' }),
			},
			tax_class: {
				'ui:label': t('Tax Class', { _tags: 'core' }),
				'ui:widget': (props) => <TaxClassSelect {...props} />,
			},
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data', { _tags: 'core' }) },
		}),
		[t]
	);

	/**
	 *
	 */
	return <EditDocumentForm document={variation} fields={fields} uiSchema={uiSchema} withJSONTree />;
};

export default EditVariation;
