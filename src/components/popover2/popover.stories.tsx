import * as React from 'react';
import Button from '../button';
import Text from '../text';
import Portal from '../portal2';

import Popover from '.';

export default {
	title: 'Components/Popover2',
};

export const basicUsage = () => {
	const [visible, setVisible] = React.useState(false);

	return (
		<Portal.Provider>
			<Popover
				trigger={<Button title="Click me!" onPress={() => setVisible(true)} />}
				visible={visible}
			>
				<Text>Hello World</Text>
			</Popover>
		</Portal.Provider>
	);
};
