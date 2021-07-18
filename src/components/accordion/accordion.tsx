import * as React from 'react';
import { View } from 'react-native';
import Collapsable from '../collapsible';
import * as Styled from './styles';

interface AccordionItemProps {
	label: React.ReactNode;
	content: React.ReactNode;
}

export interface AccordionProps {
	items: AccordionItemProps[];
}

export const Accordion = ({ items }: AccordionProps) => {
	const [currentIndex, setCurrentIndex] = React.useState<number | null>(null);

	return (
		<Styled.Container>
			{items.map(({ label, content }, index) => {
				return (
					<>
						<Styled.LabelContainer
							onPress={() => {
								setCurrentIndex(index === currentIndex ? null : index);
							}}
						>
							<Styled.Label>{label}</Styled.Label>
						</Styled.LabelContainer>
						<Collapsable open={index === currentIndex}>
							{typeof content === 'string' ? <Styled.Content>{content}</Styled.Content> : content}
						</Collapsable>
					</>
				);
			})}
		</Styled.Container>
	);
};
