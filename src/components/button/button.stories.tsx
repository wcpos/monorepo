import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import Icon from '../icon';
import Button from './button';
import Group from './group';

export default {
	title: 'Components/Button',
	component: Button,
	subcomponents: { Group },
};

export const basicUsage = () => (
	<>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} onLongPress={action('long press')} title="Primary" />
		</View>
		<View style={{ padding: 10 }}>
			<Button
				onPress={action('pressed')}
				onPressIn={action('press in')}
				onPressOut={action('press out')}
				title="Secondary"
				type="secondary"
			/>
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Attention" type="attention" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Critical" type="critical" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Info" type="info" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Success" type="success" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Warning" type="warning" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Inverse" type="inverse" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Disabled" disabled />
		</View>
	</>
);

export const clearBackground = () => (
	<>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Primary" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Secondary" type="secondary" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Attention" type="attention" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Critical" type="critical" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Info" type="info" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Success" type="success" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Warning" type="warning" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Inverse" type="inverse" background="clear" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Disabled" disabled background="clear" />
		</View>
	</>
);

export const borderOutline = () => (
	<>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Primary" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Secondary" type="secondary" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Attention" type="attention" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Critical" type="critical" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Info" type="info" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Success" type="success" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Warning" type="warning" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Inverse" type="inverse" background="outline" />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title="Disabled" disabled background="outline" />
		</View>
	</>
);

export const buttonGroup = () => (
	<Button.Group
		onPress={action('pressed')}
		// selectedIndex={select('selectedIndex', [0, 1, 2], 0)}
		// buttons={['Hello', 'World', 'Buttons']}
	>
		<Button onPress={action('pressed')} title="Primary" />
		<Button onPress={action('pressed')} title="Primary" />
		<Button onPress={action('pressed')} title="Primary" />
	</Button.Group>
);

export const buttonWithIcon = ({ title }) => (
	<>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title={title} accessoryLeft={<Icon name="remove" />} />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')} title={title} accessoryRight={<Icon name="remove" />} />
		</View>
		<View style={{ padding: 10 }}>
			<Button onPress={action('pressed')}>
				<Icon name="remove" />
			</Button>
		</View>
	</>
);
buttonWithIcon.args = {
	title: 'Remove',
};
