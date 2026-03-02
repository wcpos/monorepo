type MeasureElement<TNode> = (node: TNode) => void;

/**
 * Creates a stable ref callback that only measures when the DOM node changes.
 *
 * This prevents repeated measureElement calls for the same mounted node during
 * parent re-renders, which can cause update loops in virtualized lists.
 */
export function createStableMeasureRef<TNode>(measureElement: MeasureElement<TNode>) {
	let previousNode: TNode | null = null;

	return (node: TNode | null) => {
		if (!node) {
			previousNode = null;
			return;
		}

		if (node === previousNode) {
			return;
		}

		previousNode = node;
		measureElement(node);
	};
}
