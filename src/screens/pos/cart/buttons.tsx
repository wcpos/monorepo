import * as React from 'react';
import { View } from 'react-native';
import Button from '@wcpos/common/src/components/button';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import Checkbox from '@wcpos/common/src/components/checkbox';
import MetaData from '@wcpos/common/src/components/meta-data';
import Text from '@wcpos/common/src/components/text';
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
			<Button.Group style={{ marginBottom: 5 }}>
				<Button
					title="Add Note"
					background="outline"
					onPress={() => {
						order.atomicPatch({ customerNote: 'This is a note!' });
					}}
				/>
				<Button
					title="Order Meta"
					background="outline"
					onPress={() => {
						setVisible(true);
					}}
				/>
				<Button
					title="Save"
					background="outline"
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
			</Button.Group>
			<Button.Group>
				<Button
					title="Void"
					type="critical"
					onPress={async () => {
						order.remove();
						setCurrentOrder(undefined);
					}}
					style={{ width: '80px' }}
				/>
				<Button
					title="Checkout"
					accessoryRight={<Text type="inverse">{order.total}</Text>}
					type="success"
					onPress={async () => {
						console.log('checkout');
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
