import * as React from 'react';
import get from 'lodash/get';
import Text from '@wcpos/common/src/components/text';
import Dialog from '@wcpos/common/src/components/dialog';
import LoginForm from './login-form';

type ModalScreenProps = import('@wcpos/common/src/navigators/app').ModalScreenProps;

export const ModalScreen = ({ route, navigation }: ModalScreenProps) => {
	if (get(route, 'params.login')) {
		return <LoginForm onClose={() => navigation.goBack()} />;
	}

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
			<Text>Params from route: {route.params.foo}</Text>
		</Dialog>
	);
};
