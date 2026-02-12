import { fastFormats, formatNames, fullFormats } from './formats';

describe('ajv-formats', () => {
	describe('date format', () => {
		const dateValidate =
			typeof fullFormats.date === 'object' ? (fullFormats.date as any).validate : fullFormats.date;

		it('should validate correct dates', () => {
			expect(dateValidate('2024-01-15')).toBe(true);
			expect(dateValidate('2000-12-31')).toBe(true);
			expect(dateValidate('1999-01-01')).toBe(true);
		});

		it('should reject invalid dates', () => {
			expect(dateValidate('2024-13-01')).toBe(false); // Invalid month
			expect(dateValidate('2024-00-15')).toBe(false); // Month 0
			expect(dateValidate('2024-01-32')).toBe(false); // Invalid day
			expect(dateValidate('2024-02-30')).toBe(false); // Feb 30 doesn't exist
		});

		it('should handle leap years correctly', () => {
			expect(dateValidate('2024-02-29')).toBe(true); // 2024 is a leap year
			expect(dateValidate('2023-02-29')).toBe(false); // 2023 is not a leap year
			expect(dateValidate('2000-02-29')).toBe(true); // 2000 is a leap year (divisible by 400)
			expect(dateValidate('1900-02-29')).toBe(false); // 1900 is not a leap year (divisible by 100 but not 400)
		});

		it('should reject malformed date strings', () => {
			expect(dateValidate('not-a-date')).toBe(false);
			expect(dateValidate('2024/01/15')).toBe(false); // Wrong separator
			expect(dateValidate('15-01-2024')).toBe(false); // Wrong order
			expect(dateValidate('2024-1-15')).toBe(false); // Missing leading zero
		});

		it('should validate month-specific day limits', () => {
			expect(dateValidate('2024-04-30')).toBe(true); // April has 30 days
			expect(dateValidate('2024-04-31')).toBe(false); // April doesn't have 31 days
			expect(dateValidate('2024-01-31')).toBe(true); // January has 31 days
			expect(dateValidate('2024-06-30')).toBe(true); // June has 30 days
		});
	});

	describe('time format', () => {
		const timeValidate =
			typeof fullFormats.time === 'object' ? (fullFormats.time as any).validate : fullFormats.time;

		it('should validate correct times with timezone', () => {
			expect(timeValidate('12:30:45Z')).toBe(true);
			expect(timeValidate('00:00:00Z')).toBe(true);
			expect(timeValidate('23:59:59Z')).toBe(true);
			expect(timeValidate('12:30:45+05:00')).toBe(true);
			expect(timeValidate('12:30:45-08:00')).toBe(true);
		});

		it('should reject times without timezone in strict mode', () => {
			expect(timeValidate('12:30:45')).toBe(false); // No timezone
		});

		it('should validate times with milliseconds', () => {
			expect(timeValidate('12:30:45.123Z')).toBe(true);
			expect(timeValidate('12:30:45.123456Z')).toBe(true);
		});

		it('should reject invalid times', () => {
			expect(timeValidate('25:00:00Z')).toBe(false); // Invalid hour
			expect(timeValidate('12:60:00Z')).toBe(false); // Invalid minute
			expect(timeValidate('12:30:60Z')).toBe(false); // Invalid second (except leap second)
		});

		it('should handle leap seconds', () => {
			// Leap seconds (23:59:60) are valid in UTC
			expect(timeValidate('23:59:60Z')).toBe(true);
		});
	});

	describe('date-time format', () => {
		const dateTimeValidate =
			typeof fullFormats['date-time'] === 'object'
				? (fullFormats['date-time'] as any).validate
				: fullFormats['date-time'];

		it('should validate correct date-times', () => {
			expect(dateTimeValidate('2024-01-15T12:30:45Z')).toBe(true);
			expect(dateTimeValidate('2024-01-15T12:30:45+05:00')).toBe(true);
			expect(dateTimeValidate('2024-01-15T00:00:00Z')).toBe(true);
		});

		it('should reject invalid date-times', () => {
			expect(dateTimeValidate('2024-01-15')).toBe(false); // Missing time
			expect(dateTimeValidate('12:30:45Z')).toBe(false); // Missing date
			expect(dateTimeValidate('2024-13-15T12:30:45Z')).toBe(false); // Invalid month
		});
	});

	describe('iso-time format', () => {
		const isoTimeValidate =
			typeof fullFormats['iso-time'] === 'object'
				? (fullFormats['iso-time'] as any).validate
				: fullFormats['iso-time'];

		it('should validate times with optional timezone', () => {
			expect(isoTimeValidate('12:30:45')).toBe(true); // No timezone OK
			expect(isoTimeValidate('12:30:45Z')).toBe(true);
			expect(isoTimeValidate('12:30:45+05:00')).toBe(true);
		});
	});

	describe('iso-date-time format', () => {
		const isoDateTimeValidate =
			typeof fullFormats['iso-date-time'] === 'object'
				? (fullFormats['iso-date-time'] as any).validate
				: fullFormats['iso-date-time'];

		it('should validate date-times with optional timezone', () => {
			expect(isoDateTimeValidate('2024-01-15T12:30:45')).toBe(true);
			expect(isoDateTimeValidate('2024-01-15T12:30:45Z')).toBe(true);
		});

		it('should accept space separator', () => {
			expect(isoDateTimeValidate('2024-01-15 12:30:45')).toBe(true);
		});
	});

	describe('duration format', () => {
		const durationRegex = fullFormats.duration as RegExp;

		it('should validate ISO 8601 durations', () => {
			expect(durationRegex.test('P1Y')).toBe(true); // 1 year
			expect(durationRegex.test('P1M')).toBe(true); // 1 month
			expect(durationRegex.test('P1D')).toBe(true); // 1 day
			expect(durationRegex.test('PT1H')).toBe(true); // 1 hour
			expect(durationRegex.test('PT1M')).toBe(true); // 1 minute
			expect(durationRegex.test('PT1S')).toBe(true); // 1 second
			expect(durationRegex.test('P1Y2M3DT4H5M6S')).toBe(true); // Complex duration
			expect(durationRegex.test('P1W')).toBe(true); // 1 week
		});

		it('should reject invalid durations', () => {
			expect(durationRegex.test('P')).toBe(false); // Empty duration
			expect(durationRegex.test('1Y')).toBe(false); // Missing P
			expect(durationRegex.test('PT')).toBe(false); // T with nothing after
		});
	});

	describe('email format', () => {
		const emailRegex = fullFormats.email as RegExp;

		it('should validate correct emails', () => {
			expect(emailRegex.test('user@example.com')).toBe(true);
			expect(emailRegex.test('user.name@example.com')).toBe(true);
			expect(emailRegex.test('user+tag@example.com')).toBe(true);
			expect(emailRegex.test('user@subdomain.example.com')).toBe(true);
		});

		it('should reject invalid emails', () => {
			expect(emailRegex.test('not-an-email')).toBe(false);
			expect(emailRegex.test('@example.com')).toBe(false);
			expect(emailRegex.test('user@')).toBe(false);
			expect(emailRegex.test('user@.com')).toBe(false);
		});
	});

	describe('uuid format', () => {
		const uuidRegex = fullFormats.uuid as RegExp;

		it('should validate correct UUIDs', () => {
			expect(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
			expect(uuidRegex.test('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
			// With urn prefix
			expect(uuidRegex.test('urn:uuid:550e8400-e29b-41d4-a716-446655440000')).toBe(true);
		});

		it('should be case-insensitive', () => {
			expect(uuidRegex.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
			expect(uuidRegex.test('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
		});

		it('should reject invalid UUIDs', () => {
			expect(uuidRegex.test('not-a-uuid')).toBe(false);
			expect(uuidRegex.test('550e8400e29b41d4a716446655440000')).toBe(false); // Missing dashes
			expect(uuidRegex.test('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // Too short
			expect(uuidRegex.test('550e8400-e29b-41d4-a716-4466554400000')).toBe(false); // Too long
		});
	});

	describe('ipv4 format', () => {
		const ipv4Regex = fullFormats.ipv4 as RegExp;

		it('should validate correct IPv4 addresses', () => {
			expect(ipv4Regex.test('192.168.1.1')).toBe(true);
			expect(ipv4Regex.test('0.0.0.0')).toBe(true);
			expect(ipv4Regex.test('255.255.255.255')).toBe(true);
			expect(ipv4Regex.test('10.0.0.1')).toBe(true);
		});

		it('should reject invalid IPv4 addresses', () => {
			expect(ipv4Regex.test('256.1.1.1')).toBe(false); // Value > 255
			expect(ipv4Regex.test('192.168.1')).toBe(false); // Missing octet
			expect(ipv4Regex.test('192.168.1.1.1')).toBe(false); // Extra octet
			expect(ipv4Regex.test('192.168.1.a')).toBe(false); // Non-numeric
		});
	});

	describe('hostname format', () => {
		const hostnameRegex = fullFormats.hostname as RegExp;

		it('should validate correct hostnames', () => {
			expect(hostnameRegex.test('example.com')).toBe(true);
			expect(hostnameRegex.test('subdomain.example.com')).toBe(true);
			expect(hostnameRegex.test('localhost')).toBe(true);
			expect(hostnameRegex.test('my-server')).toBe(true);
		});

		it('should reject invalid hostnames', () => {
			expect(hostnameRegex.test('-invalid.com')).toBe(false); // Starts with dash
			expect(hostnameRegex.test('invalid-.com')).toBe(false); // Ends with dash before dot
		});
	});

	describe('url format', () => {
		const urlRegex = fullFormats.url as RegExp;

		it('should validate correct URLs', () => {
			expect(urlRegex.test('https://example.com')).toBe(true);
			expect(urlRegex.test('http://example.com/path')).toBe(true);
			expect(urlRegex.test('https://example.com:8080/path?query=value')).toBe(true);
			expect(urlRegex.test('ftp://files.example.com/file.txt')).toBe(true);
		});

		it('should reject invalid URLs', () => {
			expect(urlRegex.test('not-a-url')).toBe(false);
			expect(urlRegex.test('//example.com')).toBe(false); // Missing protocol
		});
	});

	describe('byte format (base64)', () => {
		const byteValidate =
			typeof fullFormats.byte === 'function'
				? fullFormats.byte
				: (fullFormats.byte as any).validate || (() => false);

		it('should validate correct base64 strings', () => {
			expect(byteValidate('SGVsbG8gV29ybGQ=')).toBe(true); // "Hello World"
			expect(byteValidate('dGVzdA==')).toBe(true); // "test"
			expect(byteValidate('')).toBe(true); // Empty is valid base64
		});

		it('should reject invalid base64 strings', () => {
			expect(byteValidate('not valid base64!')).toBe(false);
			expect(byteValidate('SGVsbG8gV29ybGQ')).toBe(false); // Missing padding
		});
	});

	describe('int32 format', () => {
		const int32Format = fullFormats.int32 as { type: string; validate: (n: number) => boolean };

		it('should validate 32-bit integers', () => {
			expect(int32Format.validate(0)).toBe(true);
			expect(int32Format.validate(100)).toBe(true);
			expect(int32Format.validate(-100)).toBe(true);
			expect(int32Format.validate(2147483647)).toBe(true); // MAX_INT32
			expect(int32Format.validate(-2147483648)).toBe(true); // MIN_INT32
		});

		it('should reject values outside 32-bit range', () => {
			expect(int32Format.validate(2147483648)).toBe(false); // MAX_INT32 + 1
			expect(int32Format.validate(-2147483649)).toBe(false); // MIN_INT32 - 1
		});

		it('should reject non-integers', () => {
			expect(int32Format.validate(1.5)).toBe(false);
			expect(int32Format.validate(NaN)).toBe(false);
		});
	});

	describe('int64 format', () => {
		const int64Format = fullFormats.int64 as { type: string; validate: (n: number) => boolean };

		it('should validate integers', () => {
			expect(int64Format.validate(0)).toBe(true);
			expect(int64Format.validate(Number.MAX_SAFE_INTEGER)).toBe(true);
			expect(int64Format.validate(Number.MIN_SAFE_INTEGER)).toBe(true);
		});

		it('should reject non-integers', () => {
			expect(int64Format.validate(1.5)).toBe(false);
			expect(int64Format.validate(NaN)).toBe(false);
		});
	});

	describe('regex format', () => {
		const regexValidate =
			typeof fullFormats.regex === 'function'
				? fullFormats.regex
				: (fullFormats.regex as any).validate || (() => false);

		it('should validate correct regex patterns', () => {
			expect(regexValidate('^test$')).toBe(true);
			expect(regexValidate('[a-z]+')).toBe(true);
			expect(regexValidate('\\d{3}-\\d{4}')).toBe(true);
		});

		it('should reject invalid regex patterns', () => {
			expect(regexValidate('[invalid')).toBe(false); // Unclosed bracket
			expect(regexValidate('*invalid')).toBe(false); // Invalid quantifier
		});

		it('should reject regex with \\Z anchor', () => {
			// \\Z is not supported in JavaScript regex
			expect(regexValidate('test\\Z')).toBe(false);
		});
	});

	describe('json-pointer format', () => {
		const jsonPointerRegex = fullFormats['json-pointer'] as RegExp;

		it('should validate correct JSON pointers', () => {
			expect(jsonPointerRegex.test('')).toBe(true); // Root
			expect(jsonPointerRegex.test('/foo')).toBe(true);
			expect(jsonPointerRegex.test('/foo/bar')).toBe(true);
			expect(jsonPointerRegex.test('/foo/0')).toBe(true); // Array index
			expect(jsonPointerRegex.test('/a~1b')).toBe(true); // Escaped /
			expect(jsonPointerRegex.test('/c~0d')).toBe(true); // Escaped ~
		});

		it('should reject invalid JSON pointers', () => {
			expect(jsonPointerRegex.test('foo')).toBe(false); // Missing leading /
			expect(jsonPointerRegex.test('/~')).toBe(false); // Incomplete escape
		});
	});

	describe('fastFormats variants', () => {
		it('should have faster but compatible regex patterns', () => {
			// Fast formats should accept the same valid inputs
			const fastDateRegex = (fastFormats.date as any).validate as RegExp;
			expect(fastDateRegex.test('2024-01-15')).toBe(true);
			expect(fastDateRegex.test('2024-12-31')).toBe(true);
		});
	});

	describe('formatNames', () => {
		it('should include all standard format names', () => {
			expect(formatNames).toContain('date');
			expect(formatNames).toContain('time');
			expect(formatNames).toContain('date-time');
			expect(formatNames).toContain('email');
			expect(formatNames).toContain('uuid');
			expect(formatNames).toContain('uri');
			expect(formatNames).toContain('ipv4');
			expect(formatNames).toContain('ipv6');
		});

		it('should match the keys of fullFormats', () => {
			const fullFormatKeys = Object.keys(fullFormats);
			expect(formatNames.sort()).toEqual(fullFormatKeys.sort());
		});
	});

	describe('compareDate', () => {
		const dateCompare = (fullFormats.date as any).compare;

		it('should return undefined when either argument is falsy', () => {
			expect(dateCompare('', '2024-01-15')).toBeUndefined();
			expect(dateCompare('2024-01-15', '')).toBeUndefined();
			expect(dateCompare('', '')).toBeUndefined();
		});

		it('should return 1 when first date is later', () => {
			expect(dateCompare('2024-02-01', '2024-01-01')).toBe(1);
		});

		it('should return -1 when first date is earlier', () => {
			expect(dateCompare('2024-01-01', '2024-02-01')).toBe(-1);
		});

		it('should return 0 when dates are equal', () => {
			expect(dateCompare('2024-01-15', '2024-01-15')).toBe(0);
		});
	});

	describe('compareTime', () => {
		const timeCompare = (fullFormats.time as any).compare;

		it('should return undefined when either argument is falsy', () => {
			expect(timeCompare('', '12:00:00Z')).toBeUndefined();
			expect(timeCompare('12:00:00Z', '')).toBeUndefined();
		});

		it('should return a positive number when first time is later', () => {
			expect(timeCompare('14:00:00Z', '12:00:00Z')).toBeGreaterThan(0);
		});

		it('should return a negative number when first time is earlier', () => {
			expect(timeCompare('10:00:00Z', '12:00:00Z')).toBeLessThan(0);
		});

		it('should return 0 when times are equal', () => {
			expect(timeCompare('12:00:00Z', '12:00:00Z')).toBe(0);
		});

		it('should return undefined for invalid time strings', () => {
			expect(timeCompare('not-a-time', '12:00:00Z')).toBeUndefined();
		});
	});

	describe('compareIsoTime', () => {
		const isoTimeCompare = (fullFormats['iso-time'] as any).compare;

		it('should return undefined when either argument is falsy', () => {
			expect(isoTimeCompare('', '12:00:00')).toBeUndefined();
			expect(isoTimeCompare('12:00:00', '')).toBeUndefined();
		});

		it('should return 1 when first time is later', () => {
			expect(isoTimeCompare('14:00:00', '12:00:00')).toBe(1);
		});

		it('should return -1 when first time is earlier', () => {
			expect(isoTimeCompare('10:00:00', '14:00:00')).toBe(-1);
		});

		it('should return 0 when times are equal', () => {
			expect(isoTimeCompare('12:30:45', '12:30:45')).toBe(0);
		});

		it('should return undefined for non-matching strings', () => {
			expect(isoTimeCompare('not-a-time', '12:00:00')).toBeUndefined();
			expect(isoTimeCompare('12:00:00', 'bad')).toBeUndefined();
		});
	});

	describe('compareDateTime', () => {
		const dateTimeCompare = (fullFormats['date-time'] as any).compare;

		it('should return undefined when either argument is falsy', () => {
			expect(dateTimeCompare('', '2024-01-15T12:00:00Z')).toBeUndefined();
			expect(dateTimeCompare('2024-01-15T12:00:00Z', '')).toBeUndefined();
		});

		it('should return positive when first is later', () => {
			expect(dateTimeCompare('2024-02-15T12:00:00Z', '2024-01-15T12:00:00Z')).toBeGreaterThan(0);
		});

		it('should return negative when first is earlier', () => {
			expect(dateTimeCompare('2024-01-15T12:00:00Z', '2024-02-15T12:00:00Z')).toBeLessThan(0);
		});

		it('should return 0 when date-times are equal', () => {
			expect(dateTimeCompare('2024-01-15T12:00:00Z', '2024-01-15T12:00:00Z')).toBe(0);
		});

		it('should return undefined for invalid date-time strings', () => {
			expect(dateTimeCompare('invalid', '2024-01-15T12:00:00Z')).toBeUndefined();
		});
	});

	describe('compareIsoDateTime', () => {
		const isoDateTimeCompare = (fullFormats['iso-date-time'] as any).compare;

		it('should return undefined when either argument is falsy', () => {
			expect(isoDateTimeCompare('', '2024-01-15T12:00:00')).toBeUndefined();
			expect(isoDateTimeCompare('2024-01-15T12:00:00', '')).toBeUndefined();
		});

		it('should compare by date first', () => {
			expect(isoDateTimeCompare('2024-02-01T10:00:00', '2024-01-01T14:00:00')).toBe(1);
			expect(isoDateTimeCompare('2024-01-01T14:00:00', '2024-02-01T10:00:00')).toBe(-1);
		});

		it('should compare by time when dates are equal', () => {
			const result = isoDateTimeCompare('2024-01-15T14:00:00Z', '2024-01-15T12:00:00Z');
			expect(result).toBeGreaterThan(0);
		});

		it('should return 0 for equal iso datetimes', () => {
			expect(isoDateTimeCompare('2024-01-15T12:00:00', '2024-01-15T12:00:00')).toBe(0);
		});

		it('should handle space separator', () => {
			expect(isoDateTimeCompare('2024-02-01 12:00:00', '2024-01-01 12:00:00')).toBe(1);
		});
	});

	describe('uri function', () => {
		const uriValidate =
			typeof fullFormats.uri === 'function' ? fullFormats.uri : (fullFormats.uri as any).validate;

		it('should validate URIs with path', () => {
			expect(uriValidate('http://example.com/path')).toBe(true);
		});

		it('should reject strings without URI fragment pattern', () => {
			// Strings without / or : should fail the NOT_URI_FRAGMENT check
			expect(uriValidate('just-a-string')).toBe(false);
		});

		it('should validate URIs with scheme', () => {
			expect(uriValidate('https://example.com')).toBe(true);
			expect(uriValidate('ftp://files.example.com')).toBe(true);
		});
	});
});
