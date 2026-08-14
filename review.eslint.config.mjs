// Mirrors Obsidian's plugin-review scan: their recommended ruleset over the
// shipped sources and the committed API stub, type-checked against the stub
// alone (tsconfig.review.json) — the way the scan sees the repo, with
// dependencies not installed and the real obsidian package absent.
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts", "types/**/*.d.ts"],
		languageOptions: {
			parserOptions: { project: "./tsconfig.review.json", tsconfigRootDir: import.meta.dirname },
		},
	},
];
