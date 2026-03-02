import { createStableMeasureRef } from './create-stable-measure-ref';

describe('createStableMeasureRef', () => {
	it('only calls measureElement when the node changes', () => {
		const measureElement = jest.fn();
		const measureRef = createStableMeasureRef(measureElement);
		const node = {} as Element;

		measureRef(node);
		measureRef(node);
		measureRef(node);

		expect(measureElement).toHaveBeenCalledTimes(1);
		expect(measureElement).toHaveBeenCalledWith(node);
	});

	it('resets when node is null so remount can be measured again', () => {
		const measureElement = jest.fn();
		const measureRef = createStableMeasureRef(measureElement);
		const node = {} as Element;

		measureRef(node);
		measureRef(null);
		measureRef(node);

		expect(measureElement).toHaveBeenCalledTimes(2);
	});

	it('measures again when a different node instance is provided', () => {
		const measureElement = jest.fn();
		const measureRef = createStableMeasureRef(measureElement);
		const nodeA = {} as Element;
		const nodeB = {} as Element;

		measureRef(nodeA);
		measureRef(nodeB);

		expect(measureElement).toHaveBeenCalledTimes(2);
		expect(measureElement).toHaveBeenNthCalledWith(1, nodeA);
		expect(measureElement).toHaveBeenNthCalledWith(2, nodeB);
	});

	it('ignores null when there is no mounted node', () => {
		const measureElement = jest.fn();
		const measureRef = createStableMeasureRef(measureElement);

		measureRef(null);
		measureRef(null);

		expect(measureElement).not.toHaveBeenCalled();
	});
});
