import * as React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Popover from '@wcpos/common/src/components/popover';
import Input from '@wcpos/common/src/components/textinput';
import Checkbox from '@wcpos/common/src/components/checkbox';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import AddCustomer from './add-customer-modal';

interface Props {
	ui: any;
	columns: any;
	resetUI?: () => void;
	query: any;
}

/**
 *
 */
const Actions: React.FC<Props> = ({ ui, columns }) => {
	const { t } = useTranslation();
	const [visible, setVisible] = React.useState(false);
	const [showModal, setShowModal] = React.useState(false);

	const onFilter = () => {
		console.log('change query');
	};

	return (
		<View style={{ flexDirection: 'row' }}>
			<Input
				label="Search customers"
				hideLabel
				placeholder="Search customers"
				onChange={onFilter}
			/>
			<Icon name="add" onPress={() => setShowModal(true)} />
			{showModal && <AddCustomer onClose={() => setShowModal(false)} />}
			<Popover
				open={visible}
				activator={<Icon name="cog" onPress={() => setVisible(true)} />}
				onRequestClose={() => setVisible(false)}
			>
				<Text>Columns</Text>
				{columns.map((column: any, index: number) => (
					<Checkbox
						key={column.key}
						name={column.key}
						label={t(`customers.column.label.${column.key}`)}
						checked={!column.hide}
						onChange={(checked) => {
							columns[index] = { ...column, hide: !checked };
							ui.atomicSet('columns', columns);
						}}
					/>
				))}
				{/* <Text>Display</Text>
			{display.map((d: any) => (
				<Checkbox
					key={d.key}
					name={d.key}
					label={d.label}
					checked={!d.hide}
					onChange={(checked) => {
						d.updateWithJson({ hide: !checked });
					}}
				/>
			))} */}
				<Button title="Restore Default Settings" onPress={ui.reset} />
			</Popover>
		</View>
	);
};

export default Actions;
