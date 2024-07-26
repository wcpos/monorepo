import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { useObservableEagerState, useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Pill from '@wcpos/components/src/pill';
import Form from '@wcpos/react-native-jsonschema-form';
import { Button, ButtonGroup, ButtonText } from '@wcpos/tailwind/src/button';
import { Text } from '@wcpos/tailwind/src/text';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import { CountrySelect, StateSelect } from '../../components/country-state-select';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
const Customer = ({ setShowCustomerSelect }) => {
	const [editModalOpened, setEditModalOpened] = React.useState(false);
	const { currentOrder } = useCurrentOrder();
	const billing = useObservableEagerState(currentOrder.billing$);
	const shipping = useObservableEagerState(currentOrder.shipping$);
	const customer_id = useObservableEagerState(currentOrder.customer_id$);
	const { format } = useCustomerNameFormat();
	const name = format({ billing, shipping, id: customer_id });
	const billingCountry = get(billing, ['country']);
	const shippingCountry = get(shipping, ['country']);
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...currentOrder.collection.schema.jsonSchema,
			properties: pick(currentOrder.collection.schema.jsonSchema.properties, [
				'billing',
				'shipping',
			]),
		};

		return _schema;
	}, [currentOrder.collection.schema.jsonSchema]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(() => {
		return {
			'ui:title': null,
			'ui:description': null,
			billing: {
				'ui:title': t('Billing Address', { _tags: 'core' }),
				'ui:description': null,
				'ui:collapsible': 'opened',
				'ui:order': [
					'first_name',
					'last_name',
					'email',
					'company',
					'phone',
					'address_1',
					'address_2',
					'city',
					'postcode',
					'state',
					'country',
				],
				first_name: {
					'ui:label': t('First Name', { _tags: 'core' }),
				},
				last_name: {
					'ui:label': t('Last Name', { _tags: 'core' }),
				},
				email: {
					'ui:label': t('Email', { _tags: 'core' }),
				},
				address_1: {
					'ui:label': t('Address 1', { _tags: 'core' }),
				},
				address_2: {
					'ui:label': t('Address 2', { _tags: 'core' }),
				},
				city: {
					'ui:label': t('City', { _tags: 'core' }),
				},
				state: {
					'ui:label': t('State', { _tags: 'core' }),
					'ui:widget': (props) => <StateSelect country={billingCountry} {...props} />,
				},
				postcode: {
					'ui:label': t('Postcode', { _tags: 'core' }),
				},
				country: {
					'ui:label': t('Country', { _tags: 'core' }),
					'ui:widget': CountrySelect,
				},
				company: {
					'ui:label': t('Company', { _tags: 'core' }),
				},
				phone: {
					'ui:label': t('Phone', { _tags: 'core' }),
				},
			},
			shipping: {
				'ui:title': t('Shipping Address', { _tags: 'core' }),
				'ui:description': null,
				'ui:collapsible': 'closed',
				'ui:order': [
					'first_name',
					'last_name',
					'company',
					'address_1',
					'address_2',
					'city',
					'postcode',
					'state',
					'country',
				],
				first_name: {
					'ui:label': t('First Name', { _tags: 'core' }),
				},
				last_name: {
					'ui:label': t('Last Name', { _tags: 'core' }),
				},
				address_1: {
					'ui:label': t('Address 1', { _tags: 'core' }),
				},
				address_2: {
					'ui:label': t('Address 2', { _tags: 'core' }),
				},
				city: {
					'ui:label': t('City', { _tags: 'core' }),
				},
				state: {
					'ui:label': t('State', { _tags: 'core' }),
					'ui:widget': (props) => <StateSelect country={shippingCountry} {...props} />,
				},
				postcode: {
					'ui:label': t('Postcode', { _tags: 'core' }),
				},
				country: {
					'ui:label': t('Country', { _tags: 'core' }),
					'ui:widget': CountrySelect,
				},
				company: {
					'ui:label': t('Company', { _tags: 'core' }),
				},
			},
		};
	}, [billingCountry, shippingCountry, t]);

	/**
	 *
	 */
	return (
		<Box horizontal align="center" space="small">
			<Text className="font-bold">{t('Customer', { _tags: 'core' })}:</Text>
			<ButtonGroup>
				<Button size="sm" className="rounded-full" onPress={() => setEditModalOpened(true)}>
					<ButtonText>{name}</ButtonText>
				</Button>
				<Button
					size="sm"
					className="rounded-full"
					onPress={() => {
						setShowCustomerSelect(true);
					}}
				>
					<Icon name="xmark" />
				</Button>
			</ButtonGroup>

			{editModalOpened && (
				<Modal
					size="large"
					opened
					onClose={() => setEditModalOpened(false)}
					title={t('Edit Customer Address', { _tags: 'core' })}
				>
					<Form
						formData={{ billing, shipping }}
						schema={schema}
						uiSchema={uiSchema}
						onChange={({ changes }) => {
							localPatch({ document: currentOrder, data: changes });
						}}
					/>
				</Modal>
			)}
		</Box>
	);
};

export default Customer;
