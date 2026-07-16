#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type Mode = "production" | "demonstration";

interface BundleManifest {
  version: 1;
  mode: Mode;
  preparedAt: string;
  sourceCommit: string;
  selfContained: true;
  credentials: {
    path: string;
    configPath: string;
    copied: true;
  };
  emailPolicy: {
    mode: "authority-gated" | "preview-only";
    sendAllowed: boolean;
    requirement: string;
  };
  installCommands: string[];
  copiedRoots: string[];
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(
  argValue(process.argv.slice(2), "--root")
    ?? path.join(repoRoot, "workflow-environments"),
);
const sourceCommit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();

const commonPaths = [
  "artifacts",
  "convex",
  "fixtures",
  "intake-pack",
  "lib",
  "scripts/acumatica",
  "scripts/printing-press-ts",
  "scripts/sps-commerce",
  "scripts/verify-acumatica-ui.mjs",
  "scripts/verify-automation.ts",
  "scripts/verify-extraction-smoke.ts",
  "package-lock.json",
  "tsconfig.json",
] as const;

const productionSkills = [
  ".agents/skills/power-smart-order-intake",
  ".agents/skills/power-smart-show-your-work",
  ".agents/skills/power-smart-sps-bol",
  ".agents/skills/power-smart-warranty-intake",
] as const;

const demonstrationOnlyPaths = [
  ".agents/skills/power-smart-illustrated-demo",
  "demo-dashboard",
  "scripts/illustrated-demo",
  "scripts/verify-illustrated-demo.ts",
] as const;

function copyPath(relativePath: string, runtimeRoot: string): void {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Required source is missing: ${relativePath}`);
  }
  const destination = path.join(runtimeRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    filter: (candidate) => {
      const relative = path.relative(repoRoot, candidate);
      return !relative.includes("node_modules")
        && !relative.includes(`${path.sep}dist${path.sep}`)
        && !relative.endsWith(".tsbuildinfo")
        && !relative.includes(`${path.sep}artifacts${path.sep}illustrated-demo${path.sep}`);
    },
  });
}

function writePackage(mode: Mode, runtimeRoot: string): void {
  const sourcePackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string>; [key: string]: unknown };
  const scripts = sourcePackage.scripts ?? {};
  const bundleManagementScripts = new Set([
    "workflows:prepare",
    "verify-workflow-environments",
  ]);

  if (mode === "production") {
    sourcePackage.scripts = Object.fromEntries(
      Object.entries(scripts).filter(([name]) => (
        !name.startsWith("demo:")
        && name !== "verify-illustrated-demo"
        && !bundleManagementScripts.has(name)
      )),
    );
  } else {
    sourcePackage.scripts = Object.fromEntries(
      Object.entries(scripts).filter(([name]) => !bundleManagementScripts.has(name)),
    );
  }

  fs.writeFileSync(
    path.join(runtimeRoot, "package.json"),
    `${JSON.stringify(sourcePackage, null, 2)}\n`,
  );
}

function parseCredentialFile(filePath: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function prepare(mode: Mode): BundleManifest {
  const environmentRoot = path.join(outputRoot, mode);
  const runtimeRoot = path.join(environmentRoot, "runtime");
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });

  for (const relativePath of commonPaths) copyPath(relativePath, runtimeRoot);
  for (const relativePath of productionSkills) copyPath(relativePath, runtimeRoot);
  if (mode === "demonstration") {
    for (const relativePath of demonstrationOnlyPaths) copyPath(relativePath, runtimeRoot);
  }
  writePackage(mode, runtimeRoot);

  const credentialDir = path.join(runtimeRoot, "intake-pack", "credentials");
  const credentialPath = path.join(credentialDir, "acumatica-sandbox.env");
  fs.chmodSync(credentialDir, 0o700);
  fs.chmodSync(credentialPath, 0o600);
  const credentialValues = parseCredentialFile(credentialPath);
  const configPath = path.join(runtimeRoot, ".acumatica-config.json");
  fs.writeFileSync(
    configPath,
    `${JSON.stringify({
      baseUrl: new URL(credentialValues.ACUMATICA_BASE_URL).origin,
      tenant: credentialValues.ACUMATICA_TENANT,
      username: credentialValues.ACUMATICA_USERNAME,
      password: credentialValues.ACUMATICA_PASSWORD,
      company: "AmeriSun Inc. - Test",
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(configPath, 0o600);
  fs.mkdirSync(path.join(runtimeRoot, "artifacts"), { recursive: true });

  const copiedRoots = [
    ...commonPaths,
    ...productionSkills,
    ...(mode === "demonstration" ? demonstrationOnlyPaths : []),
  ];
  const manifest: BundleManifest = {
    version: 1,
    mode,
    preparedAt: new Date().toISOString(),
    sourceCommit,
    selfContained: true,
    credentials: {
      path: "intake-pack/credentials/acumatica-sandbox.env",
      configPath: ".acumatica-config.json",
      copied: true,
    },
    emailPolicy: mode === "demonstration"
      ? {
          mode: "preview-only",
          sendAllowed: false,
          requirement: "Compose and display the draft for illustration. Never send it.",
        }
      : {
          mode: "authority-gated",
          sendAllowed: true,
          requirement: "Follow the production skill and obtain explicit send authority.",
        },
    installCommands: mode === "demonstration"
      ? ["npm install", "npm --prefix demo-dashboard install"]
      : ["npm install"],
    copiedRoots,
  };

  fs.writeFileSync(
    path.join(runtimeRoot, "workflow-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(runtimeRoot, "WORKFLOW_MODE.md"),
    mode === "demonstration"
      ? "# Demonstration mode\n\nRun commands with `HOME=\"$PWD\" ACUMATICA_CONFIG=\"$PWD/.acumatica-config.json\"`.\n\nEmail is preview-only. Compose and show the draft. Never send it.\n"
      : "# Production mode\n\nRun commands with `HOME=\"$PWD\" ACUMATICA_CONFIG=\"$PWD/.acumatica-config.json\"`.\n\nFollow production authority and validation gates.\n",
  );

  return manifest;
}

const manifests = [prepare("production"), prepare("demonstration")];
console.log(JSON.stringify({
  status: "prepared",
  outputRoot,
  environments: manifests.map((manifest) => ({
    mode: manifest.mode,
    runtime: path.join(outputRoot, manifest.mode, "runtime"),
    emailPolicy: manifest.emailPolicy.mode,
    sendAllowed: manifest.emailPolicy.sendAllowed,
  })),
}, null, 2));
