import * as React from 'react';

import Dialog from '@wcpos/components/src/dialog';
import Text from '@wcpos/components/src/text';

const ModalScreen = ({ route, navigation }) => {
	return (
		<Dialog
			sectioned
			title="Nice Modal"
			open
			onClose={() => navigation.goBack()}
			primaryAction={{ label: 'Got it!', action: () => navigation.goBack() }}
			secondaryActions={[
				{ label: 'I am dumb', action: () => navigation.goBack() },
				{ label: 'Share', action: () => navigation.goBack() },
			]}
		>
			<Text>Text inside the Dialog!</Text>
			<Text>Params from route: {route.params}</Text>
		</Dialog>
	);
};

export default ModalScreen;
