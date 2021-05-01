import * as React from 'react';
import * as Styled from './styles';

export interface SectionProps {
	/**
	 * Content to put in Dialog Section.
	 */
	children: React.ReactNode;
}

/**
 * Wraps Dialog content in a section which provides correct padding for content.
 */
export const Section = ({ children }: SectionProps) => <Styled.Section>{children}</Styled.Section>;
