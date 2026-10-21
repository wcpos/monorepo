import { adjustForPadding } from './adjust-for-padding';

describe('adjustForPadding', () => {
	it('subtracts the gutter from each side', () => {
		// Regular's `p-4` is 16: 32 off each axis.
		expect(adjustForPadding(400, 300, 16)).toEqual({ width: 368, height: 268 });
		// Spacious's is 20: 40 off each axis.
		expect(adjustForPadding(400, 300, 20)).toEqual({ width: 360, height: 260 });
	});

	it('never goes below 0', () => {
		expect(adjustForPadding(30, 10, 16)).toEqual({ width: 0, height: 0 });
	});
});
