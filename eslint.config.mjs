import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{
		files: ["src/**/*.ts"],
		ignores: ["src/__mocks__/**"],
		extends: [tseslint.configs.base],
		plugins: {
			obsidianmd,
		},
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// TypeScript rules flagged by the scanner
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
			"@typescript-eslint/only-throw-error": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-floating-promises": "error",

			// Obsidian rules
			"obsidianmd/commands/no-command-in-command-id": "warn",
			"obsidianmd/commands/no-command-in-command-name": "warn",
			"obsidianmd/commands/no-default-hotkeys": "warn",
			"obsidianmd/commands/no-plugin-id-in-command-id": "warn",
			"obsidianmd/commands/no-plugin-name-in-command-name": "warn",
			"obsidianmd/settings-tab/no-manual-html-headings": "warn",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "warn",
			"obsidianmd/vault/iterate": "warn",
			"obsidianmd/detach-leaves": "warn",
			"obsidianmd/hardcoded-config-path": "warn",
			"obsidianmd/no-forbidden-elements": "warn",
			"obsidianmd/no-plugin-as-component": "warn",
			"obsidianmd/no-sample-code": "warn",
			"obsidianmd/no-tfile-tfolder-cast": "warn",
			"obsidianmd/no-view-references-in-plugin": "warn",
			"obsidianmd/no-static-styles-assignment": "warn",
			"obsidianmd/object-assign": "warn",
			"obsidianmd/platform": "warn",
			"obsidianmd/prefer-file-manager-trash-file": "warn",
			"obsidianmd/prefer-abstract-input-suggest": "warn",
			"obsidianmd/regex-lookbehind": "warn",
			"obsidianmd/sample-names": "warn",
			"obsidianmd/validate-manifest": "warn",
			"obsidianmd/validate-license": "warn",
			"obsidianmd/ui/sentence-case": "warn",
		},
	},
);
