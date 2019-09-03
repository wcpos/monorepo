import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Button from '../button';
import Portal from '../portal';
import Text from '../text';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import Modal from './';

const Example1 = () => {
	const [visible, setVisible] = useState(false);

	const onOpen = () => {
		setVisible(true);
	};
	const onClose = () => {
		setVisible(false);
	};

	return (
		<ScrollView>
			<Button title="Show Modal" onPress={onOpen} />
			<Modal visible={visible}>
				<View style={{ paddingVertical: 20 }}>
					<Text style={{ textAlign: 'center' }}>Content...</Text>
					<Text style={{ textAlign: 'center' }}>Content...</Text>
				</View>
				<Button title="Close Modal" onPress={onClose} />
			</Modal>
		</ScrollView>
	);
};

storiesOf('Modal', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Portal.Host>
			<Example1 />
		</Portal.Host>
	));
