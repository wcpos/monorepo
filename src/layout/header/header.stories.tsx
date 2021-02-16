import * as React from 'react';
import Button from '../../components/button';
import Text from '../../components/text';
import Header, { IHeaderProps } from './header';

export default {
	title: 'Layout/Header',
	component: Header,
};

export const basicUsage = ({ title }: IHeaderProps) => <Header title={title} />;

export const subComponents = ({ title }: IHeaderProps) => (
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
