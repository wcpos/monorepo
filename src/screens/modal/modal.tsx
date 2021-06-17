import * as React from 'react';
import { useNavigation } from '@react-navigation/native';
import Text from '@wcpos/common/src/components/text';
import Dialog from '@wcpos/common/src/components/dialog';

export const ModalScreen = () => {
	const navigation = useNavigation();

	// return <Button title="Close" onPress={() => navigation.goBack()} />;
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
		</Dialog>
	);
};
