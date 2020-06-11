import React from 'react';
import * as Styled from './styles';

interface Props {
	children?: React.ReactNode;
	left?: React.ReactNode;
	right?: React.ReactNode;
	title?: string | React.ReactNode;
}

const Left: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<Styled.Left>{children}</Styled.Left>
);

const Right: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<Styled.Right>{children}</Styled.Right>
);

const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<Styled.Center>
		{typeof children === 'string' ? <Styled.Title>{children}</Styled.Title> : children}
	</Styled.Center>
);

const Header: React.FC<Props> = ({ children, ...props }) => {
	const childCount = React.Children.count(children);
	const left = [];
	let title = <Title>{props.title}</Title>;
	const right = [];

	// sub components
	if (childCount > 0) {
		children.map((child, index) => {
			if (child.type.name === 'Left') {
				left.push(<Left key={index}>{child.props.children}</Left>);
			}
			if (child.type.name === 'Title') {
				title = <Title key={index}>{child.props.children}</Title>;
			}
			if (child.type.name === 'Right') {
				right.push(<Right key={index}>{child.props.children}</Right>);
			}
		});
	}

	return (
		<Styled.Header>
			{left}
			{title}
			{right}
		</Styled.Header>
	);
};

export default Object.assign(Header, { Left, Title, Right });
