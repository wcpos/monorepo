import React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import { text, select, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Button, { ButtonGroup } from './';

storiesOf('Button', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<>
			<View style={{ padding: 10 }}>
				<Button onPress={action('pressed')} title="Primary" />
			</View>
			<View style={{ padding: 10 }}>
				<Button onPress={action('pressed')} title="Secondary" type="secondary" />
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
				<Button onPress={action('pressed')} title="Disabled" disabled={true} />
			</View>
		</>
	))

	/**
	 *
	 */
	.add('clear background', () => (
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
				<Button onPress={action('pressed')} title="Disabled" disabled={true} background="clear" />
			</View>
		</>
	))

	/**
	 *
	 */
	.add('border outline', () => (
		<>
			<View style={{ padding: 10 }}>
				<Button onPress={action('pressed')} title="Primary" background="outline" />
			</View>
			<View style={{ padding: 10 }}>
				<Button
					onPress={action('pressed')}
					title="Secondary"
					type="secondary"
					background="outline"
				/>
			</View>
			<View style={{ padding: 10 }}>
				<Button
					onPress={action('pressed')}
					title="Attention"
					type="attention"
					background="outline"
				/>
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
				<Button onPress={action('pressed')} title="Disabled" disabled={true} background="outline" />
			</View>
		</>
	))

	/**
	 *
	 */
	.add('basic group usage', () => (
		<ButtonGroup
			onPress={action('pressed')}
			selectedIndex={select('selectedIndex', [0, 1, 2], 0)}
			buttons={['Hello', 'World', 'Buttons']}
		/>
	));
