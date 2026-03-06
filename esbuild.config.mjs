import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian"],
	format: "cjs",
	target: "es2022",
	outfile: "main.js",
	sourcemap: "inline",
	logLevel: "info",
});
