#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { readJson, writeJson } from 'fs-extra';

async function addLicenseToPackageJson() {
	dotenv.config();

	const licenseKey = process.env.RXDB_LICENSE_KEY;
	if (!licenseKey) {
		console.error('LICENSE_KEY not found in .env file');
		process.exit(1);
	}

	const packageJsonPath = './package.json'; // Adjust path as necessary
	try {
		const packageJson = await readJson(packageJsonPath);

		// Ensuring accessTokens object exists
		if (!packageJson.accessTokens) {
			packageJson.accessTokens = {};
		}

		// Adding the license key to rxdb-premium in accessTokens
		packageJson.accessTokens['rxdb-premium'] = licenseKey;

		await writeJson(packageJsonPath, packageJson, { spaces: 2 });
		console.log('License key added to package.json under accessTokens');
	} catch (error) {
		console.error('Error updating package.json:', error);
		process.exit(1);
	}
}

addLicenseToPackageJson();
