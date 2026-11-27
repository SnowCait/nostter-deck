import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { normalizePath } from 'vite';

export const viteLicenseReport = '.vite/licenses.json';
const licenseFilename = 'THIRD_PARTY_LICENSES.txt';
const licenseDocument = /^(?:licen[cs]e|copying|notice|copyright|third[-_ ]party[-_ ]licen[cs]e)/i;
const primaryLicense = /^(?:licen[cs]e|copying)/i;

// Tailwind inlines these imports from src/routes/layout.css before Vite sees the output CSS.
// The shadcn-svelte package license also covers the UI components copied into src/lib.
const stylesheetPackages = ['tailwindcss', 'tw-animate-css', 'shadcn-svelte'];

/** @type {Record<string, [heading: string, file: string][] | undefined>} */
const embeddedLicenses = {
	'dexie@4.4.7': [['safari-14-idb-fix 3.0.0', 'safari-14-idb-fix-3.0.0.txt']],
	'emoji-picker-element@1.29.1': [['blob-util 2.0.2', 'blob-util-2.0.2.txt']],
	'emoji-picker-element-data@1.8.0': [
		['emojibase-data 17.0.0', 'emojibase-data-17.0.0.txt'],
		['Unicode CLDR annotations 48.0.0', 'cldr-annotations-48.0.0.txt'],
		['Unicode Emoji 17.0 copyright notice', 'unicode-emoji-17.0-notice.txt'],
		['Unicode Emoji data license', 'unicode-data-license.txt']
	]
};

/**
 * @typedef {{ name: string, version: string, identifier?: string, text?: string }} ViteLicenseEntry
 * @typedef {Omit<ViteLicenseEntry, 'text'> & { documents: Map<string, string> }} LicenseEntry
 */

/** @param {string} id @param {string} root */
function packageDirectory(id, root) {
	if (id.startsWith('\0')) {
		return undefined;
	}
	const path = normalizePath(resolve(root, id));
	return /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(path)?.[1];
}

/** @param {Map<string, string>} documents @param {string} heading @param {string} content */
function addDocument(documents, heading, content) {
	const text = content.replace(/\r\n/g, '\n').trim();
	if (!text || [...documents.keys()].some((existing) => existing.includes(text))) {
		return;
	}
	// Some copyright files reproduce the entire license inside a comment.
	for (const existing of documents.keys()) {
		if (text.includes(existing)) {
			documents.delete(existing);
		}
	}
	documents.set(text, heading);
}

/** @returns {import('vite').Plugin} */
export function frontendLicenses() {
	return {
		name: 'frontend-licenses',
		apply: 'build',
		applyToEnvironment: (environment) => environment.config.consumer === 'client',
		generateBundle: {
			order: 'post',
			handler(_, bundle) {
				const report = bundle[viteLicenseReport];
				if (report?.type !== 'asset' || typeof report.source !== 'string') {
					this.error('Vite did not generate the client license report');
				}
				/** @type {Map<string, LicenseEntry>} */
				const entries = new Map();
				/** @type {ViteLicenseEntry[]} */
				const viteEntries = JSON.parse(report.source);
				for (const { name, version, identifier, text } of viteEntries) {
					const documents = new Map();
					if (text) {
						addDocument(documents, '', text);
					}
					entries.set(`${name}@${version}`, { name, version, identifier, documents });
				}

				const root = this.environment.config.root;
				const modules = new Set();
				const packageDirs = new Set();
				for (const item of Object.values(bundle)) {
					for (const id of item.type === 'chunk' ? item.moduleIds : item.originalFileNames) {
						if (item.type === 'chunk') {
							modules.add(id);
						}
						const dir = packageDirectory(id, root);
						if (dir) {
							packageDirs.add(dir);
						}
					}
				}
				for (const name of stylesheetPackages) {
					packageDirs.add(join(root, 'node_modules', name));
				}
				if (modules.has(normalizePath(join(root, 'src/lib/paraglide/runtime.js')))) {
					packageDirs.add(join(root, 'node_modules/@inlang/paraglide-js'));
				}
				const vitePackage = join(root, 'node_modules/vite/package.json');
				if (
					modules.has('\0vite/preload-helper.js') ||
					modules.has('\0vite/modulepreload-polyfill.js')
				) {
					packageDirs.add(dirname(vitePackage));
				}
				if (modules.has('\0rolldown/runtime.js')) {
					packageDirs.add(dirname(createRequire(vitePackage).resolve('rolldown/package.json')));
				}

				for (const dir of [...packageDirs].sort()) {
					/** @type {{ name: string, version: string, license?: string }} */
					const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
					const { name, version, license } = manifest;
					const key = `${name}@${version}`;
					const entry = entries.get(key) ?? {
						name,
						version,
						identifier: license,
						documents: new Map()
					};
					entries.set(key, entry);

					let hasLicense = entry.documents.size > 0;
					for (const file of readdirSync(dir, { withFileTypes: true }).sort((left, right) =>
						left.name < right.name ? -1 : Number(left.name > right.name)
					)) {
						if (!file.isFile() || !licenseDocument.test(file.name)) {
							continue;
						}
						let text = readFileSync(join(dir, file.name), 'utf8');
						if (name === 'vite' && file.name === 'LICENSE.md') {
							// Only Vite's browser helpers are shipped, so omit the build tool's dependency licenses.
							text = text.split('\n# Licenses of bundled dependencies')[0];
						}
						addDocument(entry.documents, file.name, text);
						hasLicense ||= primaryLicense.test(file.name) && Boolean(text.trim());
					}
					if (!hasLicense) {
						this.warn(`No license text found in the installed package ${key}`);
					}

					for (const [heading, file] of embeddedLicenses[key] ?? []) {
						const source = new URL(`./frontend-license-sources/${file}`, import.meta.url);
						addDocument(entry.documents, heading, readFileSync(source, 'utf8'));
					}
					if (
						!embeddedLicenses[key] &&
						Object.keys(embeddedLicenses).some((key) => key.startsWith(`${name}@`))
					) {
						this.warn(`Review embedded third-party notices for ${key}`);
					}
				}

				const sections = [...entries]
					.sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
					.map(([, { name, version, identifier, documents }]) => {
						const title = `${name} ${version}${identifier ? ` (${identifier})` : ''}`;
						return [
							title,
							...[...documents].map(([text, heading]) => (heading ? `${heading}\n\n${text}` : text))
						].join('\n\n');
					});
				this.emitFile({
					type: 'asset',
					fileName: licenseFilename,
					source: `Third-party frontend licenses\n\n${sections.join('\n\n--------------------------------------------------------------------------------\n\n')}\n`
				});
			}
		}
	};
}
