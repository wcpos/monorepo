import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableSuspense, useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Select from '@wcpos/components/src/select';
import Text from '@wcpos/components/src/text';
import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import useRestHttpClient from '../../hooks/use-rest-http-client';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddShipping } from '../hooks/use-add-shipping';

/**
 *
 */
const ShippingSelect = ({ shippingResource, selectedMethod, onSelect }) => {
	const options = useObservableSuspense(shippingResource);
	const http = useRestHttpClient();
	const { storeDB } = useAppState();

	React.useEffect(() => {
		async function fetchShippingMethods() {
			try {
				const { data } = await http.get('shipping_methods');
				storeDB.upsertLocal('shipping', {
					methods: data,
				});
			} catch (err) {
				log.error(err);
			}
		}

		fetchShippingMethods();
	}, [http, storeDB]);

	return <Select options={options} value={selectedMethod} onChange={onSelect} />;
};

const initialData = {
	method_title: '',
	method_id: '',
	total: '',
};

/**
 *
 */
const AddShipping = () => {
	const [opened, setOpened] = React.useState(false);
	const [data, setData] = React.useState(initialData);
	const { currentOrder } = useCurrentOrder();
	const { addShipping } = useAddShipping();
	const currencySymbol = useObservableState(
		currentOrder.currency_symbol$,
		currentOrder.currency_symbol
	);
	const t = useT();

	/**
	 * Create observable shipping resource
	 */
	// const shippingResource = React.useMemo(() => {
	// 	return new ObservableResource(
	// 		storeDB?.getLocal$('shipping').pipe(
	// 			map((localDoc) => {
	// 				const methods = localDoc?.get('methods') || [];
	// 				return methods.map((method) => ({
	// 					label: method.title,
	// 					value: method.id,
	// 				}));
	// 			})
	// 		)
	// 	);
	// }, [storeDB]);

	/**
	 *
	 */
	const handleChange = React.useCallback(
		(newData) => {
			setData((prev) => ({ ...prev, ...newData }));
		},
		[setData]
	);

	const handleAddShipping = () => {
		try {
			const { method_title, method_id, total } = data;
			addShipping({
				method_title: isEmpty(method_title) ? t('Shipping', { _tags: 'core' }) : method_title,
				method_id: isEmpty(method_id) ? 'local_pickup' : method_id,
				total: isEmpty(total) ? '0' : total,
			});
			setData(initialData);
			setOpened(false);
		} catch (error) {
			log.error(error);
		}
	};

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				method_title: { type: 'string', title: t('Shipping Method Title', { _tags: 'core' }) },
				method_id: { type: 'string', title: t('Shipping Method ID', { _tags: 'core' }) },
				total: { type: 'string', title: t('Total', { _tags: 'core' }) },
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
			method_title: {
				'ui:placeholder': t('Shipping', { _tags: 'core' }),
			},
			method_id: {
				'ui:placeholder': 'local_pickup',
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
					<Text>{t('Add Shipping', { _tags: 'core' })}</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={() => setOpened(true)} />
				</Box>
			</Box>
			<Modal
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Add Shipping', { _tags: 'core' })}
				primaryAction={{
					label: t('Add to Cart', { _tags: 'core' }),
					action: handleAddShipping,
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

export default AddShipping;
