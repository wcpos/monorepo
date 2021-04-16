import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import Text from '@wcpos/common/src/components/text';

const CustomerSelect = () => {
	const [visible, setVisible] = React.useState(false);

	return (
		<Popover
			hideBackdrop
			open={visible}
			onRequestClose={() => setVisible(false)}
			activator={<Button title="Select Customer" onPress={() => setVisible(!visible)} />}
		>
			<Text>hi</Text>
		</Popover>
	);
};

export default CustomerSelect;
