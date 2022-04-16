import * as React from 'react';
import Dialog from '@wcpos/components/src/dialog';
import Tabs from '@wcpos/components/src/tabs';
import TextInput from '@wcpos/components/src/textinput';
import Tree from '@wcpos/components/src/tree';

type OrderModalProps = {
	order: import('@wcpos/database').OrderDocument;
	onClose: () => void;
};

const Modal = ({ order, onClose }: OrderModalProps) => {
	const [selected, setSelected] = React.useState(0);

	const content =
		selected === 0 ? (
			<Dialog.Section>
				<TextInput label="Order Number" value={order.number} />
			</Dialog.Section>
		) : (
			<Dialog.Section>
				<Tree data={order.toJSON()} />
			</Dialog.Section>
		);

	return (
		<Dialog open title="Order" onClose={onClose} primaryAction={{ label: 'Save ' }}>
			<Tabs tabs={['Order', 'JSON']} selected={selected} onSelect={setSelected}>
				{content}
			</Tabs>
		</Dialog>
	);
};

export default Modal;
