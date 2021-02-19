import * as React from 'react';
import get from 'lodash/get';
import * as Styled from './styles';

export interface IHeaderProps {
	children: string | React.ReactElement | React.ReactElement[];
}

const Left: React.FC = ({ children }) => <Styled.Left>{children}</Styled.Left>;
const Right: React.FC = ({ children }) => <Styled.Right>{children}</Styled.Right>;
const Title: React.FC = ({ children }) => (
	<Styled.Center>
		{typeof children === 'string' ? <Styled.Title>{children}</Styled.Title> : children}
	</Styled.Center>
);

export const Header = ({ children }: IHeaderProps) => {
	let title = <Title>{children}</Title>;
	const left: React.ReactNode[] = [];
	const right: React.ReactNode[] = [];

	React.Children.forEach(children, (child: React.ReactChild) => {
		if (React.isValidElement(child) && typeof child.type !== 'string') {
			const displayName = get(child, 'type.displayName');
			if (displayName === 'Header.Left') {
				left.push(<Left>{child.props.children}</Left>);
			}
			if (displayName === 'Header.Title') {
				title = <Title>{child.props.children}</Title>;
			}
			if (displayName === 'Header.Right') {
				right.push(<Right>{child.props.children}</Right>);
			}
		}
	});

	return <Styled.Header>{left.concat(title).concat(right)}</Styled.Header>;
};

Header.Left = Left;
Header.Right = Right;
Header.Title = Title;
