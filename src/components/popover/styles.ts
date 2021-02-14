import styled from 'styled-components/native';

type Props = { theme: import('../../lib/theme/types').ThemeProps };

export const Wrapper = styled.View<Props>`
	align-self: flex-start;
`;

export const ContentView = styled.View<Props>`
	justify-content: center;
	background-color: white;
	border-radius: 3px;
	box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
	padding: 5px;
	min-width: 300px;
`;
