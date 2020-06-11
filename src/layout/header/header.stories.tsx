import React from 'react';
import { text } from '@storybook/addon-knobs';
import Header from '.';
import Button from '../../components/button';
import Text from '../../components/text';

export default {
	title: 'Layout/Header',
};

export const basicUsage = () => <Header title={text('title', 'Title')} />;

export const subComponents = () => (
	<Header>
		<Header.Left>
			<Button title="Left" />
		</Header.Left>
		<Header.Title>{text('title', 'Title')}</Header.Title>
		<Header.Right>
			<Text>Right</Text>
		</Header.Right>
		<Header.Right>
			<Button title="Right" />
		</Header.Right>
	</Header>
);
