import styled from 'styled-components/native';

// eslint-disable-next-line import/prefer-default-export
export const Dimmer = styled.View`
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.85);
	opacity: 1;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	z-index: 1000;
`;
