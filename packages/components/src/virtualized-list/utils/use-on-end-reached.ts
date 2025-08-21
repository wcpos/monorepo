import * as React from 'react';

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

			// when within threshold → fire once
			if (distanceFromEnd <= viewSize * onEndReachedThreshold) {
				if (!endReachedRef.current) {
					onEndReached();
					endReachedRef.current = true;
				}
			} else {
				// reset when scrolled away
				endReachedRef.current = false;
			}
		};

		container.addEventListener('scroll', handleScroll);
		handleScroll();
		return () => container.removeEventListener('scroll', handleScroll);
	}, [scrollElement, horizontal, onEndReached, onEndReachedThreshold]);

	// Reset flag when data changes
	React.useEffect(() => {
		if (!scrollElement || typeof onEndReached !== 'function' || data.length === 0) return;
		hasTriggeredForShortContent.current = false;
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
