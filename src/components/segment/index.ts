import { Segment, SegmentProps } from './segment';
import { SegmentGroup, SegmentGroupProps } from './group';
import { SegmentButtons, SegmentButtonProps } from './buttons';

Object.assign(Segment, { Group: SegmentGroup, Buttons: SegmentButtons });

export type { SegmentProps, SegmentGroupProps, SegmentButtonProps };

export default Segment as typeof Segment & {
	Group: typeof SegmentGroup;
	Buttons: typeof SegmentButtons;
};
