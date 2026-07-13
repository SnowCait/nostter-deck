import { defineConfig } from '@playwright/test';

export default defineConfig({
	timeout: 120_000,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		trace: process.env.CI ? 'retain-on-failure' : 'off',
		screenshot: process.env.CI ? 'only-on-failure' : 'off'
	},
	webServer: { command: 'npm run build && npm run preview', port: 4173, timeout: 120_000 },
	testMatch: '**/*.e2e.{ts,js}'
});
