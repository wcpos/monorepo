import * as React from 'react';
import Box from '@wcpos/components/src/box';
import { useTheme } from 'styled-components/native';
import { useObservableState } from 'observable-hooks';
import pick from 'lodash/pick';
import useStore from '@wcpos/hooks/src/use-store';
import Pill from '@wcpos/components/src/pill';
import Modal, { useModal } from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
// import Form from '@wcpos/react-native-jsonschema-form';
import EditModal from '../../common/edit-modal';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-new-customer';
import UISettings from '../../common/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CartHeaderProps {
	order: OrderDocument;
	ui: any;
}

/**
 *
 */
const CartHeader = ({ order, ui }: CartHeaderProps) => {
	const theme = useTheme();
	const { storeDB } = useStore();
	let customer = useObservableState(
		storeDB?.collections.customers.findOne({ selector: { id: order.customer_id } }).$
	);
	const { ref, open, close } = useModal();

	if (order.customer_id === 0) {
		customer = { username: 'Guest' };
	}

	/**
	 *
	 */
	const handleCustomerRemove = React.useCallback(async () => {
		await order.atomicPatch({ customer_id: -1 });
	}, [order]);

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		async ({ value: selectedCustomer }) => {
			const billingEmail = selectedCustomer.billing.email || selectedCustomer.email;

			await order.atomicPatch({
				customer_id: selectedCustomer.id,
				billing: { ...selectedCustomer.billing, email: billingEmail },
				shipping: selectedCustomer.shipping,
			});
		},
		[order]
	);

	/**
	 *
	 */
	const handleSaveCustomer = React.useCallback(() => {
		console.log('save');
	}, []);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...order.collection.schema.jsonSchema,
			properties: pick(order.collection.schema.jsonSchema.properties, ['billing', 'shipping']),
		};

		return _schema;
	}, [order.collection.schema.jsonSchema]);

	/**
	 *
	 */
	useWhyDidYouUpdate('Cart Header', { order, ui, theme, storeDB, customer });

	/**
	 *
	 */
	return (
		<Box
			horizontal
			space="small"
			padding="small"
			align="center"
			style={{
				backgroundColor: theme.colors.grey,
				borderTopLeftRadius: theme.rounding.medium,
				borderTopRightRadius: theme.rounding.medium,
				height: 51,
			}}
		>
			<Box style={{ flex: 1 }}>
				<ErrorBoundary>
					{customer ? (
						<Box horizontal align="center" space="small">
							<Text weight="bold">Customer:</Text>
							<Pill removable onRemove={handleCustomerRemove} onPress={open}>
								{customer.username}
							</Pill>
						</Box>
					) : (
						<CustomerSelect onSelectCustomer={handleCustomerSelect} />
					)}
				</ErrorBoundary>
			</Box>
			<AddCustomer />
			<UISettings ui={ui} />
			<Modal
				ref={ref}
				title="Edit Customer Addresses"
				primaryAction={{ label: 'Edit Customer', action: handleSaveCustomer }}
				secondaryActions={[{ label: 'Cancel', action: close }]}
			>
				<EditModal
					// formData={{ billing: order.billing, shipping: order.shipping }}
					item={order}
					schema={schema}
					uiSchema={{}}
				/>
			</Modal>
		</Box>
	);
};

export default CartHeader;
