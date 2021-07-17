import * as React from 'react';
import { View } from 'react-native';
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
					<View style={{ flex: 1 }}>
						<Styled.LabelContainer
							onPress={() => {
								setCurrentIndex(index === currentIndex ? null : index);
							}}
						>
							<Styled.Label>{label}</Styled.Label>
						</Styled.LabelContainer>
						{index === currentIndex && (
							<Styled.ContentContainer>
								{typeof content === 'string' ? <Styled.Content>{content}</Styled.Content> : content}
							</Styled.ContentContainer>
						)}
					</View>
				);
			})}
		</Styled.Container>
	);
};
