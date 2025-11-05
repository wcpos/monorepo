const fs = require('fs');
const { exec } = require('child_process');
// const { rm } = require('./utils/file-actions');

const cwd = process.cwd();

// Console colors for better output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
};

const log = {
	info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
	success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
	warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
	error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
	progress: (msg) => console.log(`${colors.blue}→${colors.reset} ${msg}`),
	header: (msg) => console.log(`\n${colors.bright}${colors.magenta}${msg}${colors.reset}`),
};

const rm = (path) => {
	if (fs.existsSync(path)) {
		log.progress(`Removing ${path}`);
		exec(`rm -r ${path}`, (err) => {
			if (err) {
				log.error(`Failed to remove ${path}: ${err.message}`);
			} else {
				log.success(`Removed ${path}`);
			}
		});
	} else {
		log.info(`${path} does not exist, skipping`);
	}
};

const clean = (dir) => {
	log.info(`Cleaning directory: ${dir}`);
	rm(`${dir}/node_modules`);
	rm(`${dir}/build`);
	rm(`${dir}/dist`);
	rm(`${dir}/.expo`);
	rm(`${dir}/.turbo`);
	rm(`${dir}/pnpm-lock.yaml`);
};

const cleanRoot = () => {
	log.header('🧹 Cleaning Root Directory');
	clean(cwd);
};

const cleanWorkSpaces = () => {
	log.header('🧹 Cleaning Workspace Directories');
	const workspaces = ['./apps', './packages'];

	workspaces.forEach((workspace) => {
		log.info(`Scanning workspace: ${workspace}`);
		fs.readdir(workspace, (err, folders) => {
			if (err) {
				log.error(`Failed to read directory ${workspace}: ${err.message}`);
				return;
			}

			log.info(`Found ${folders.length} folders in ${workspace}`);
			folders.forEach((folder) => {
				clean(`${cwd}/${workspace}/${folder}`);
			});
		});
	});
};

// Main execution
log.header('🚀 Starting Node Modules Cleanup');
log.info(`Working directory: ${cwd}`);

cleanRoot();
cleanWorkSpaces();

log.header('✨ Cleanup Complete!');
log.info('All node_modules, build artifacts, and lock files have been processed.');
