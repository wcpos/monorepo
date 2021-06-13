import * as React from 'react';
import { Tag } from './tag';
import * as Styled from './styles';

/**
 * Action with a Label.
 */
export interface TextAction {
	/**
	 * Unique key identifier
	 */
	key?: string | number;
	/**
	 * Label to display.
	 */
	label: string;
	/**
	 * Action to execute on click.
	 */
	action?: () => void;
}

/**
 *
 */
export interface TagGroupProps {
	/**
	 *
	 */
	tags: (TextAction | string)[];
}

/**
 *
 */
export const TagGroup = ({ tags }: TagGroupProps) => {
	return (
		<Styled.Group>
			{tags.map((tag, i) =>
				typeof tag === 'string' ? (
					<Tag key={i}>tag</Tag>
				) : (
					<Tag key={tag.key || i} onPress={tag.action}>
						{tag.label}
					</Tag>
				)
			)}
		</Styled.Group>
	);
};

/**
 *
 */
export interface TagGroupSkeletonProps {
	/**
	 *
	 */
	numberOfTags?: number;
}

/**
 *
 */
const TagGroupSkeleton = ({ numberOfTags = 3 }: TagGroupSkeletonProps) => {
	return (
		<Styled.Group>
			{Array.from({ length: numberOfTags }, (v, i) => (
				<Tag.Skeleton key={i} />
			))}
		</Styled.Group>
	);
};

TagGroup.Skeleton = TagGroupSkeleton;
