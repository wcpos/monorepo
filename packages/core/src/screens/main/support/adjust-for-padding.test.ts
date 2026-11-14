import { adjustForPadding } from './adjust-for-padding';

describe('adjustForPadding', () => {
	it('subtracts the gutter from each side', () => {
		// Regular's `p-gutter` is 12: 24 off each axis.
		expect(adjustForPadding(400, 300, 12)).toEqual({ width: 376, height: 276 });
		// Spacious's is 15: 30 off each axis.
		expect(adjustForPadding(400, 300, 15)).toEqual({ width: 370, height: 270 });
	});

	it('never goes below 0', () => {
		expect(adjustForPadding(20, 10, 12)).toEqual({ width: 0, height: 0 });
	});
});
