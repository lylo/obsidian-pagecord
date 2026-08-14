import obsidianmd from "eslint-plugin-obsidianmd";

// Obsidian's own recommended config, so a local run matches what plugin review
// reports. It pulls in typescript-eslint's type-checked rules, which need the
// project's types resolvable: run `npm install` first or every Obsidian API call
// is seen as `any` and the no-unsafe-* rules fire on almost every line.
export default [
	{
		// Only the plugin sources are type-checked here, matching what plugin
		// review reports. The config files sit outside tsconfig's `include`, so
		// type-aware rules cannot resolve them at all.
		ignores: ["main.js", "*.config.ts", "*.config.mjs", "types/**", "src/__mocks__/**", "**/*.test.ts"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
