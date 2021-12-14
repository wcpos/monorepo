import * as React from 'react';
import * as Styled from './styles';
import Icon from '../icon';
import Pressable from '../pressable';
import Skeleton from '../skeleton';

export interface TagProps {
	/**
	 * Tag label
	 */
	children: string;
	/**
	 * Set to `true` add remove icon.
	 */
	removable?: boolean;
	/**
	 * Set to `true` to disable.
	 */
	disabled?: boolean;
	/**
	 * Called if remove icon is pressed
	 */
	onRemove?: () => void;
	/**
	 * Called if tag is pressed
	 */
	onPress?: () => void;
}

/**
 *
 */
export const Tag = ({ children, removable, disabled, onRemove, onPress }: TagProps) => {
	const tag = (
		<Styled.Tag disabled={disabled} style={removable ? { paddingRight: 1 } : {}}>
			<Styled.Label size="small">{children}</Styled.Label>
			{removable && (
				<Icon
					name="xmark"
					size="xSmall"
					disabled={disabled}
					onPress={onRemove}
					backgroundStyle={{ marginLeft: 2, padding: 0, backgroundColor: 'transparent' }}
					type="inverse"
				/>
			)}
		</Styled.Tag>
	);

	return <Pressable onPress={disabled ? undefined : onPress}>{tag}</Pressable>;
};

/**
 *
 */
export interface TagSkeletonProps {
	/**
	 *
	 */
	width?: number;
	/**
	 *
	 */
	height?: number;
}

/**
 *
 */
const TagSkeleton = ({ width = 50, height = 20 }: TagSkeletonProps) => (
	<Styled.TagSkeleton width={width} height={height} />
);

Tag.Skeleton = TagSkeleton;
