import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import Tabs from '@wcpos/common/src/components/tabs';
import Text from '@wcpos/common/src/components/text';

type ProductModalProps = {
	product: import('@wcpos/common/src/database').ProductDocument;
	onClose: () => void;
};

const Modal = ({ product, onClose }: ProductModalProps) => {
	const [selected, setSelected] = React.useState(0);

	const content =
		selected === 0 ? (
			<Dialog.Section>
				<TextInput label="Name" value={product.name} />
			</Dialog.Section>
		) : (
			<Dialog.Section>
				<Text>JSON</Text>
			</Dialog.Section>
		);

	return (
		<Dialog title={product.name} open onClose={onClose} primaryAction={{ label: 'Save' }}>
			<Tabs tabs={['Product', 'JSON']} selected={selected} onSelect={setSelected}>
				{content}
			</Tabs>
		</Dialog>
	);
};

export default Modal;
