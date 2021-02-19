import * as React from 'react';
import Button from '../../components/button';
import Text from '../../components/text';
import { Header, IHeaderProps } from './header';

export default {
	title: 'Layout/Header',
	component: Header,
};

export const basicUsage = ({ title }: { title: string }) => <Header>{title}</Header>;
basicUsage.args = {
	title: 'Title',
};

export const subComponents = ({ title }: { title: string }) => (
	<Header>
		<Header.Left>
			<Button title="Left" />
		</Header.Left>
		<Header.Title>{title}</Header.Title>
		<Header.Right>
			<Text>Right</Text>
		</Header.Right>
		<Header.Right>
			<Button title="Right" />
		</Header.Right>
	</Header>
);
subComponents.args = {
	title: 'Title',
};
