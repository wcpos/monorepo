import * as React from 'react';

import { throttle } from 'lodash';

interface UseOnEndReachedParams {
	scrollElement: HTMLDivElement | null;
	horizontal: boolean;
	onEndReached?: () => void;
	onEndReachedThreshold: number;
	data: readonly any[];
	getTotalSize: () => number;
}

export function useOnEndReached({
	scrollElement,
	horizontal,
	onEndReached,
	onEndReachedThreshold,
	data,
	getTotalSize,
}: UseOnEndReachedParams) {
	const endReachedRef = React.useRef(false);
	const hasTriggeredForShortContent = React.useRef(false);

	// Handle scroll-based onEndReached
	React.useEffect(() => {
		if (!scrollElement || typeof onEndReached !== 'function') return;

		const container = scrollElement;
		const handleScroll = () => {
			const offset = horizontal ? container.scrollLeft : container.scrollTop;
			const viewSize = horizontal ? container.clientWidth : container.clientHeight;
			const fullSize = horizontal ? container.scrollWidth : container.scrollHeight;

			const distanceFromEnd = fullSize - (offset + viewSize);
			const thresholdDistance = viewSize * onEndReachedThreshold;

			// Add a small buffer (5px) to handle cases where user scrolls exactly to the bottom
			const isAtAbsoluteEnd = distanceFromEnd <= 5;
			const isWithinThreshold = distanceFromEnd <= thresholdDistance;

			// when within threshold or at absolute end → fire once
			if (isWithinThreshold || isAtAbsoluteEnd) {
				if (!endReachedRef.current) {
					onEndReached();
					endReachedRef.current = true;
				}
			} else {
				// Reset when scrolled away significantly (beyond threshold + some buffer)
				// This ensures that if user is at absolute bottom, they need to scroll up
				// beyond the threshold to reset, not just wiggle
				const resetDistance = Math.max(thresholdDistance * 1.5, 50);
				if (distanceFromEnd > resetDistance) {
					endReachedRef.current = false;
				}
			}
		};

		// Throttle the scroll handler to limit calls to once every 100ms
		const throttledHandleScroll = throttle(handleScroll, 100);

		container.addEventListener('scroll', throttledHandleScroll);
		handleScroll(); // Call immediately for initial check
		return () => {
			container.removeEventListener('scroll', throttledHandleScroll);
			throttledHandleScroll.cancel(); // Cancel any pending throttled calls
		};
	}, [scrollElement, horizontal, onEndReached, onEndReachedThreshold]);

	// Reset flags when data changes (new content loaded)
	React.useEffect(() => {
		if (!scrollElement || typeof onEndReached !== 'function' || data.length === 0) return;
		hasTriggeredForShortContent.current = false;
		// Also reset the scroll-based flag when new data is loaded
		// This allows onEndReached to be called again after new content is added
		endReachedRef.current = false;
	}, [data, scrollElement, onEndReached]);

	// Handle short content onEndReached
	React.useEffect(() => {
		if (!scrollElement || typeof onEndReached !== 'function' || data.length === 0) return;
		if (hasTriggeredForShortContent.current) return;

		const container = scrollElement;
		const checkContentSize = () => {
			const containerSize = horizontal ? container.clientWidth : container.clientHeight;
			const totalContentSize = getTotalSize();

			// If virtualized content is smaller than container, trigger onEndReached
			if (totalContentSize <= containerSize) {
				hasTriggeredForShortContent.current = true;
				onEndReached();
			}
		};

		const timeoutId = setTimeout(checkContentSize, 0);
		return () => clearTimeout(timeoutId);
	}, [scrollElement, horizontal, onEndReached, data.length, getTotalSize]);
}
