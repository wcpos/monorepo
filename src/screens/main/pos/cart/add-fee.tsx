import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddFee } from '../hooks/use-add-fee';

const initialData = {
	name: '',
	total: '',
	taxable: true,
	tax_class: '',
};

/**
 * TODO: tax_status = taxable by default, perhaps put this as setting?
 */
const AddFee = () => {
	const [opened, setOpened] = React.useState(false);
	const [data, setData] = React.useState(initialData);
	const { currentOrder } = useCurrentOrder();
	const { addFee } = useAddFee();
	const currencySymbol = useObservableState(
		currentOrder.currency_symbol$,
		currentOrder.currency_symbol
	);
	const t = useT();

	/**
	 *
	 */
	const handleChange = React.useCallback(
		(newData) => {
			setData((prev) => ({ ...prev, ...newData }));
		},
		[setData]
	);

	/**
	 *
	 */
	const handleAddFee = React.useCallback(() => {
		try {
			const { name, total, taxable, tax_class } = data;
			addFee({
				name: isEmpty(name) ? t('Fee', { _tags: 'core' }) : name,
				total: isEmpty(total) ? '0' : total,
				tax_status: taxable ? 'taxable' : 'none',
				tax_class,
			});
			setData(initialData);
			setOpened(false);
		} catch (error) {
			log.error(error);
		}
	}, [addFee, data, t]);

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				name: { type: 'string', title: t('Fee Name', { _tags: 'core' }) },
				total: { type: 'string', title: t('Total', { _tags: 'core' }) },
				taxable: { type: 'boolean', title: t('Taxable', { _tags: 'core' }) },
				tax_class: { type: 'string', title: t('Tax Class', { _tags: 'core' }) },
			},
		}),
		[t]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			total: {
				'ui:options': { prefix: currencySymbol },
				'ui:placeholder': '0',
			},
			name: {
				'ui:placeholder': t('Fee', { _tags: 'core' }),
			},
		}),
		[currencySymbol, t]
	);

	/**
	 *
	 */
	return (
		<>
			<Box horizontal space="small" padding="small" align="center">
				<Box fill>
					<Text>{t('Add Fee', { _tags: 'core' })}</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={() => setOpened(true)} />
				</Box>
			</Box>
			<Modal
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Add Fee', { _tags: 'core' })}
				primaryAction={{
					label: t('Add to Cart', { _tags: 'core' }),
					action: handleAddFee,
				}}
				secondaryActions={[
					{ label: t('Cancel', { _tags: 'core' }), action: () => setOpened(false) },
				]}
			>
				<Box space="small">
					<Form formData={data} schema={schema} uiSchema={uiSchema} onChange={handleChange} />
				</Box>
			</Modal>
		</>
	);
};

export default AddFee;
