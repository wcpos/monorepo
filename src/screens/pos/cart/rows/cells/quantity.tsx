import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import TextInput from '@wcpos/common/src/components/textinput';
import Popover from '@wcpos/common/src/components/popover';
import Numpad from '@wcpos/common/src/components/numpad';

interface Props {
	lineItem: import('@wcpos/common/src/database').LineItemDocument;
}

const Quantity = ({ lineItem }: Props) => {
	const [visible, setVisible] = React.useState(false);
	const quantity = useObservableState(lineItem.quantity$, lineItem.quantity);

	const handleChangeText = async (newValue: string): Promise<void> => {
		lineItem.atomicPatch({ quantity: Number(newValue) });
	};

	return (
		<Popover
			open={visible}
			onRequestClose={() => setVisible(false)}
			activator={
				<TextInput
					autosize
					value={String(quantity)}
					onChange={handleChangeText}
					onFocus={() => setVisible(true)}
				/>
			}
		>
			<Numpad placeholder={String(quantity)} />
		</Popover>
	);
};

export default Quantity;
