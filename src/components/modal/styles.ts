import styled from 'styled-components/native';

type ModalProps = {
	theme: import('../../lib/theme/types').ThemeProps;
} & import('./modal').ModalProps;

export const ModalContainer = styled.View<ModalProps>`
	z-index: 1000;
`;
