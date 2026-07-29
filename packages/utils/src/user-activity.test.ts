import { lastUserActivityMs, markUserActivity } from './user-activity';

describe('user activity', () => {
	it('starts at zero and records explicit or current timestamps', () => {
		expect(lastUserActivityMs()).toBe(0);

		markUserActivity(1234);
		expect(lastUserActivityMs()).toBe(1234);

		const now = jest.spyOn(Date, 'now').mockReturnValue(5678);
		markUserActivity();
		expect(lastUserActivityMs()).toBe(5678);
		now.mockRestore();
	});
});
