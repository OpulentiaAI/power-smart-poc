#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseEnvFile(filePath: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const args = process.argv.slice(2);
const envFile = path.resolve(argValue(args, "--env-file") ?? "intake-pack/credentials/acumatica-sandbox.env");
const sessionDir = path.resolve(argValue(args, "--session-dir") ?? "artifacts/illustrated-demo/.session");

if (!fs.existsSync(envFile)) {
  console.error(`Credential source not found: ${envFile}`);
  process.exit(1);
}

const source = parseEnvFile(envFile);
const required = [
  "ACUMATICA_BASE_URL",
  "ACUMATICA_TENANT",
  "ACUMATICA_USERNAME",
  "ACUMATICA_PASSWORD",
] as const;
const missing = required.filter((key) => !source[key]);

if (missing.length > 0) {
  console.error(`Credential source is missing: ${missing.join(", ")}`);
  process.exit(1);
}

let baseUrl: string;
try {
  baseUrl = new URL(source.ACUMATICA_BASE_URL).origin;
} catch {
  console.error("ACUMATICA_BASE_URL is not a valid URL.");
  process.exit(1);
}

fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
fs.chmodSync(sessionDir, 0o700);
const configPath = path.join(sessionDir, ".acumatica-config.json");
fs.writeFileSync(
  configPath,
  `${JSON.stringify({
    baseUrl,
    tenant: source.ACUMATICA_TENANT,
    username: source.ACUMATICA_USERNAME,
    password: source.ACUMATICA_PASSWORD,
    company: argValue(args, "--company") ?? "AmeriSun Inc. - Test",
  }, null, 2)}\n`,
  { mode: 0o600 },
);
fs.chmodSync(configPath, 0o600);

console.log(JSON.stringify({
  status: "prepared",
  baseUrl,
  tenant: source.ACUMATICA_TENANT,
  sessionDir,
  configPath,
  commandPrefix: `HOME=${JSON.stringify(sessionDir)} ACUMATICA_CONFIG=${JSON.stringify(configPath)}`,
}, null, 2));
