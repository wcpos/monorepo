import styled from 'styled-components/native';

type ThemeProps = import('../../lib/theme').ThemeProps;

export const Wrapper = styled.View<{ theme: ThemeProps }>`
	align-self: flex-start;
`;

export const ContentView = styled.View<{ theme: ThemeProps }>`
	justify-content: center;
	background-color: white;
	border-radius: 3px;
	box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
	padding: 5px;
	min-width: 300px;
`;
