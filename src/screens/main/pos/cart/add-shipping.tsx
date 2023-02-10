import * as React from 'react';
import { TextInput } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Select from '@wcpos/components/src/select';
import Text from '@wcpos/components/src/text';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';
import log from '@wcpos/utils/src/logger';

import useStore from '../../../../contexts/store';
import { t } from '../../../../lib/translations';
import useRestHttpClient from '../../hooks/use-rest-http-client';
import useCurrentOrder from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface AddShippingProps {
	order: OrderDocument;
}

/**
 *
 */
const ShippingSelect = ({ shippingResource, selectedMethod, onSelect }) => {
	const options = useObservableSuspense(shippingResource, (val) => !!val);
	const http = useRestHttpClient();
	const { storeDB } = useStore();

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

/**
 *
 */
const AddShipping = ({ order }: AddShippingProps) => {
	const [opened, setOpened] = React.useState(false);
	const shippingAmountRef = React.useRef<TextInput>(null);
	const { addShipping } = useCurrentOrder();
	const [shippingMethod, setShippingMethod] = React.useState('local_pickup');
	const { storeDB } = useStore();

	/**
	 * Create observable shipping resource
	 */
	const shippingResource = React.useMemo(() => {
		return new ObservableResource(
			storeDB?.getLocal$('shipping').pipe(
				map((localDoc) => {
					const methods = localDoc?.get('methods') || [];
					return methods.map((method) => ({
						label: method.title,
						value: method.id,
					}));
				})
			)
		);
	}, [storeDB]);

	const handleAddShipping = () => {
		const total = shippingAmountRef.current?.value;
		addShipping({
			method_title: 'Shipping',
			method_id: shippingMethod,
			total,
		});
		setOpened(false);
	};

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
					<ShippingSelect
						shippingResource={shippingResource}
						selectedMethod={shippingMethod}
						onSelect={setShippingMethod}
					/>
					<TextInputWithLabel
						ref={shippingAmountRef}
						label={t('Amount', { _tags: 'core' })}
						prefix={order.currency_symbol}
					/>
					{/* <Checkbox value={true} label={t('Taxable')} /> */}
				</Box>
			</Modal>
		</>
	);
};

export default AddShipping;
