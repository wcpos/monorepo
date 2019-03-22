import styled from 'styled-components/native';

export const DimmerView = styled.View`
	position: absolute;
	top: 0em;
	left: 0em;
	width: 100%;
	height: 100%;
	text-align: center;
	vertical-align: middle;
	padding: 1em;
	background-color: rgba(0, 0, 0, 0.85);
	opacity: 1;
	line-height: 1;
	animation-fill-mode: both;
	animation-duration: 0.5s;
	transition: background-color 0.5s linear;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	user-select: none;
	will-change: opacity;
	z-index: 1000;
`;
