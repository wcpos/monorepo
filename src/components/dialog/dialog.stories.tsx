import * as React from 'react';
import { View } from 'react-native';
import Button from '../button';
import Text from '../text';
import Icon from '../icon';
import { Dialog } from './dialog';

export default {
	title: 'Components/Dialog',
	component: Dialog,
	subcomponents: { 'Dialog.Section': Dialog.Section },
};

const LOREM_IPSUM =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

export const Basic: React.FC = () => {
	const [visible, setVisible] = React.useState(false);

	return (
		<View>
			<Button onPress={() => setVisible(true)}>Show me how!</Button>
			<Dialog
				sectioned
				title="Nice Modal"
				open={visible}
				onClose={() => setVisible(false)}
				primaryAction={{ label: 'Got it!', action: () => setVisible(false) }}
				secondaryActions={[
					{ label: 'I am dumb', action: () => setVisible(false) },
					{ label: 'Share', action: () => setVisible(false) },
				]}
			>
				<Text>Text inside the Dialog!</Text>
			</Dialog>
		</View>
	);
};

export const Advanced: React.FC = () => {
	const [visible, setVisible] = React.useState(false);

	return (
		<View>
			<Button onPress={() => setVisible(true)}>Show me how!</Button>
			<Dialog
				title="Review"
				open={visible}
				onClose={() => setVisible(false)}
				primaryAction={{ label: 'Accept', action: () => setVisible(false) }}
				secondaryActions={[{ label: 'Decline', action: () => setVisible(false) }]}
			>
				<Dialog.Section>
					<View>
						<Text>Terms and Conditions</Text>
						<Text>{LOREM_IPSUM}</Text>
						<Text>{LOREM_IPSUM}</Text>
					</View>
				</Dialog.Section>
				<Dialog.Section>
					<View>
						<Icon name="feedback" />
						<Text>
							If feeling confident, you can put anything in the Modal content and even have multiple
							sections...
						</Text>
					</View>
				</Dialog.Section>
			</Dialog>
		</View>
	);
};
