import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCSSRequest, normalizePath } from 'vite';

export const viteLicenseReport = '.vite/licenses.json';
const licenseDocument = /^(?:licen[cs]e|copying|notice|copyright|third[-_ ]party[-_ ]licen[cs]e)/i;

/**
 * @typedef {{ name: string, version: string, identifier?: string, text?: string }} ViteLicenseEntry
 * @typedef {Omit<ViteLicenseEntry, 'text'> & { documents: Map<string, string> }} LicenseEntry
 */

/** @param {string} source @param {string} stylesheet */
function resolveStylesheetSource(source, stylesheet) {
	if (source.startsWith('file:')) {
		return fileURLToPath(source);
	}
	const relative = resolve(dirname(stylesheet), source);
	// CSS optimizers can serialize an absolute path without its leading slash.
	return existsSync(relative) ? relative : resolve(parse(stylesheet).root, source);
}

/** @returns {import('vite').Plugin} */
export function frontendLicenses() {
	/** @type {Map<string, string[]>} */
	const stylesheetSources = new Map();
	/** @type {Map<string, string[]>} */
	const stylesheetDependencies = new Map();

	return {
		name: 'frontend-licenses',
		apply: 'build',
		applyToEnvironment: (environment) => environment.config.consumer === 'client',
		config: () => ({
			css: {
				// Read CSS preprocessor provenance without publishing production sourcemaps.
				devSourcemap: true,
				// Vite reports its inlined CSS imports as PostCSS dependency messages.
				postcss: {
					plugins: [
						{
							postcssPlugin: 'frontend-license-dependencies',
							OnceExit(_, { result }) {
								if (result.opts.from) {
									stylesheetDependencies.set(
										normalizePath(result.opts.from),
										result.messages.flatMap(({ type, file }) =>
											type === 'dependency' && typeof file === 'string' ? [file] : []
										)
									);
								}
							}
						}
					]
				}
			}
		}),
		transform(_, id) {
			if (isCSSRequest(id)) {
				stylesheetSources.set(normalizePath(id), this.getCombinedSourcemap().sources);
			}
		},
		generateBundle: {
			order: 'post',
			handler(_, bundle) {
				const report = bundle[viteLicenseReport];
				if (report?.type !== 'asset' || typeof report.source !== 'string') {
					this.error('Vite did not generate the client license report');
				}

				/** @type {ViteLicenseEntry[]} */
				const viteEntries = JSON.parse(report.source);
				/** @type {Map<string, LicenseEntry>} */
				const entries = new Map();
				for (const { name, version, identifier, text } of viteEntries) {
					entries.set(`${name}@${version}`, {
						name,
						version,
						identifier,
						documents: new Map(text ? [[text.trim(), text]] : [])
					});
				}

				const root = this.environment.config.root;
				const packageDirs = new Set();
				for (const item of Object.values(bundle)) {
					for (const id of item.type === 'chunk' ? item.moduleIds : item.originalFileNames) {
						if (id.startsWith('\0')) {
							continue;
						}
						const path = normalizePath(resolve(root, id));
						const sources = stylesheetSources.get(path) ?? [];
						for (const source of [
							path,
							...(stylesheetDependencies.get(path) ?? []).map(normalizePath),
							...sources.map((source) => normalizePath(resolveStylesheetSource(source, path)))
						]) {
							const dir = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(source)?.[1];
							if (dir && existsSync(join(dir, 'package.json'))) {
								packageDirs.add(dir);
							}
						}
					}
				}

				for (const dir of [...packageDirs].sort()) {
					/** @type {{ name: string, version: string, license?: string }} */
					const { name, version, license } = JSON.parse(
						readFileSync(join(dir, 'package.json'), 'utf8')
					);
					const key = `${name}@${version}`;
					const entry = entries.get(key) ?? {
						name,
						version,
						identifier: license,
						documents: new Map()
					};
					entries.set(key, entry);

					const files = readdirSync(dir, { withFileTypes: true })
						.filter((file) => file.isFile() && licenseDocument.test(file.name))
						.map((file) => file.name)
						.sort();
					for (const file of files) {
						const text = readFileSync(join(dir, file), 'utf8');
						const normalized = text.trim();
						if (normalized && !entry.documents.has(normalized)) {
							entry.documents.set(normalized, `${file}\n\n${text}`);
						}
					}
				}

				const sections = [...entries]
					.sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
					.map(([, { name, version, identifier, documents }]) => {
						const title = `${name} ${version}${identifier ? ` (${identifier})` : ''}`;
						return [title, ...documents.values()].join('\n\n');
					});
				this.emitFile({
					type: 'asset',
					fileName: 'THIRD_PARTY_LICENSES.txt',
					source: `Third-party frontend licenses\n\n${sections.join('\n\n--------------------------------------------------------------------------------\n\n')}\n`
				});
			}
		}
	};
}
