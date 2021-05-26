import * as React from 'react';
import { View } from 'react-native';
import Button from '@wcpos/common/src/components/button';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import Checkbox from '@wcpos/common/src/components/checkbox';
import MetaData from '@wcpos/common/src/components/meta-data';
import useAuthLogin from '@wcpos/common/src/hooks/use-auth-login';
import { POSContext } from '../pos';

export interface ButtonsProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const Buttons = ({ order }: ButtonsProps) => {
	const { setCurrentOrder } = React.useContext(POSContext);
	const [visible, setVisible] = React.useState(false);
	const showAuthLogin = useAuthLogin();

	return (
		<>
			<Button.Group>
				<Button
					title="Add Fee"
					onPress={() => {
						order.addFeeLine({ name: 'Fee', total: '10' });
					}}
				/>
				<Button
					title="Add Shipping"
					onPress={() => {
						order.addShippingLine({
							methodTitle: 'Shipping',
							methodId: 'test',
							total: '5',
						});
					}}
				/>
				<Button
					title="Add Note"
					onPress={() => {
						order.atomicPatch({ customerNote: 'This is a note!' });
					}}
				/>
				<Button
					title="Options"
					onPress={() => {
						setVisible(true);
					}}
				/>
				<Button
					title="Save"
					onPress={async () => {
						const replicationState = order.syncRestApi({
							push: {},
						});
						replicationState.error$.subscribe((err: any) => {
							if (err.code === 401) {
								showAuthLogin();
							}
						});
						replicationState.run(false);
					}}
				/>
				<Button
					title="Void"
					type="critical"
					onPress={async () => {
						order.remove();
						setCurrentOrder(undefined);
					}}
				/>
			</Button.Group>
			{visible && (
				<Dialog
					title="Order Data"
					open
					onClose={() => setVisible(false)}
					primaryAction={{ label: 'Save', action: () => setVisible(false) }}
				>
					<Dialog.Section>
						<TextInput label="Order Number" value={order.number} />
						<Checkbox
							label="Price Includes Tax"
							checked={order.pricesIncludeTax}
							onChange={(value) => order.atomicPatch({ pricesIncludeTax: value })}
						/>
						<MetaData
							// @ts-ignore
							data={order.metaData}
						/>
						<TextInput label="Currency Symbol" value={order.currencySymbol} />
					</Dialog.Section>
				</Dialog>
			)}
		</>
	);
};

export default Buttons;
