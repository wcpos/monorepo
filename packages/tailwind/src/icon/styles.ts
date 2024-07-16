import styled from 'styled-components/native';

import { Pressable } from '../pressable/pressable';

export const PressableIcon = styled(Pressable)`
	padding: 2px;
	border-radius: ${({ theme }) => `${theme.rounding.small}px`};
`;

// TODO -  transition: background-color 0.3s ease-in-out;
