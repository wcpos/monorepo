import React from 'react';
import { action } from '@storybook/addon-actions';
import { View } from 'react-native';
import Text from '../text';
import Button from '../button';
import { Box, BoxProps } from './box';

export default {
	title: 'Components/Box',
	component: Box,
};

export const Basic = (props: BoxProps) => (
	<Box {...props}>
		<Text>A</Text>
		<Text>B</Text>
		<Text>C</Text>
	</Box>
);

export const MediumPadding = (props: BoxProps) => (
	<Box padding="medium">
		<Text>Test</Text>
		<Text>Test 2</Text>
		<Text>Test 3</Text>
	</Box>
);

export const XLargePadding = (props: BoxProps) => (
	<Box padding="x-large">
		<Text>Test</Text>
		<Text>Test 2</Text>
		<Text>Test 3</Text>
	</Box>
);

export const WithSpacing = (props: BoxProps) => (
	<Box horizontal space="medium">
		<Button onPress={action('Button 1 clicked')}>Button 1</Button>
		<Button onPress={action('Button 2 clicked')}>Button 2</Button>
		<Button onPress={action('Button 3 clicked')}>Button 3</Button>
	</Box>
);

export const ReversedAndCentered = (props: BoxProps) => (
	<Box space="medium" align="center" reverse>
		<Text>Test Test Test 1</Text>
		<Text>Test Test Test 2</Text>
		<Text>Test Test Test 3</Text>
	</Box>
);

export const Distribution = (props: BoxProps) => (
	<View style={{ height: 200 }}>
		<Box fill distribution="center" align="end">
			<Text>Test Test Test 1</Text>
			<Text>Test Test Test 2</Text>
			<Text>Test Test Test 3</Text>
		</Box>
	</View>
);
