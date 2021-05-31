import * as React from 'react';
import Dialog from '@wcpos/common/src/components/dialog';
import Tabs from '@wcpos/common/src/components/tabs';
import TextInput from '@wcpos/common/src/components/textinput';

type OrderModalProps = {
	order: import('@wcpos/common/src/database').OrderDocument;
	onClose: () => void;
};

const Modal = ({ order, onClose }: OrderModalProps) => {
	return (
		<Dialog open title="Order" onClose={onClose} primaryAction={{ label: 'Save ' }}>
			<Dialog.Section>
				<TextInput label="Order Number" />
			</Dialog.Section>
		</Dialog>
	);
};

export default Modal;
