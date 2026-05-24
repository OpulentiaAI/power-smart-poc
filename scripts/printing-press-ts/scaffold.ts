#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

interface ServiceManifest {
  service: string;
  baseUrl: string;
  tokenEnvVars: string[];
  authKeyUrl?: string;
  authInstructions?: string;
}

function usage(): void {
  console.log(`TypeScript Printing Press scaffold

USAGE:
  npm run printing-press-ts -- scaffold --manifest <service.json> --out <dir>

The manifest should contain: service, baseUrl, tokenEnvVars, authKeyUrl, authInstructions.
`);
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function serviceConstName(service: string): string {
  return service.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function renderCli(manifest: ServiceManifest): string {
  const constName = serviceConstName(manifest.service);
  return `#!/usr/bin/env node
import { printJson, probeBearerStatus, showAuthSetup, writeConfig } from "../../lib/printing-press-ts/runtime.js";

const ${constName} = ${JSON.stringify(manifest, null, 2)} as const;

function usage(): void {
  console.log(\`${manifest.service} CLI

USAGE:
  npm run ${manifest.service} -- auth setup [--launch]
  npm run ${manifest.service} -- config --base-url <url> [--token <token>]
  npm run ${manifest.service} -- status [--probe-url <url>]
\`);
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const [command, subcommand, ...args] = process.argv.slice(2);
  if (command === "auth" && subcommand === "setup") return showAuthSetup(${constName}, args.includes("--launch"));
  if (command === "config") {
    const filePath = writeConfig(${constName}, {
      baseUrl: argValue(args, "--base-url") || ${constName}.baseUrl,
      token: argValue(args, "--token"),
    });
    return printJson({ status: "configured", config_path: filePath });
  }
  if (command === "status") return probeBearerStatus(${constName}, argValue(args, "--probe-url"));
  usage();
}

main().catch((error) => {
  printJson({ status: "error", error: error.message });
  process.exit(1);
});
`;
}

function scaffold(args: string[]): void {
  const manifestPath = argValue(args, "--manifest");
  const outDir = argValue(args, "--out");
  if (!manifestPath || !outDir) {
    usage();
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ServiceManifest;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "cli.ts"), renderCli(manifest), "utf8");
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "scaffolded", out: outDir }, null, 2));
}

const [command, ...args] = process.argv.slice(2);
if (command === "scaffold") scaffold(args);
else usage();
