#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface Manifest {
  mode: "production" | "demonstration";
  selfContained: boolean;
  credentials: { path: string; configPath: string; copied: boolean };
  emailPolicy: {
    mode: "authority-gated" | "preview-only";
    sendAllowed: boolean;
    requirement: string;
  };
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "power-smart-environments-"));
const failures: string[] = [];

try {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/prepare-workflow-environments.ts",
      "--root",
      tempRoot,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const sourceCredential = fs.readFileSync(
    path.join(repoRoot, "intake-pack/credentials/acumatica-sandbox.env"),
  );
  if (output.includes(sourceCredential.toString("utf8"))) {
    failures.push("bundle preparation printed credential contents");
  }

  const manifests = new Map<string, Manifest>();
  for (const mode of ["production", "demonstration"] as const) {
    const runtimeRoot = path.join(tempRoot, mode, "runtime");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runtimeRoot, "workflow-manifest.json"), "utf8"),
    ) as Manifest;
    manifests.set(mode, manifest);

    const credentialPath = path.join(runtimeRoot, manifest.credentials.path);
    const configPath = path.join(runtimeRoot, manifest.credentials.configPath);
    if (!manifest.selfContained || !manifest.credentials.copied) {
      failures.push(`${mode} is not marked self-contained`);
    }
    if (!fs.existsSync(credentialPath)) {
      failures.push(`${mode} credential copy is missing`);
    } else {
      const modeBits = fs.statSync(credentialPath).mode & 0o777;
      if (modeBits !== 0o600) failures.push(`${mode} credential mode is ${modeBits.toString(8)}, not 600`);
      if (!fs.readFileSync(credentialPath).equals(sourceCredential)) {
        failures.push(`${mode} credential copy differs from source`);
      }
    }
    if (!fs.existsSync(configPath) || (fs.statSync(configPath).mode & 0o777) !== 0o600) {
      failures.push(`${mode} generated config is missing or not mode 600`);
    }

    for (const required of [
      "fixtures",
      "artifacts/sps-bol-run",
      "intake-pack/assets",
      "lib/power-smart",
      "scripts/acumatica",
      ".agents/skills/power-smart-order-intake",
    ]) {
      if (!fs.existsSync(path.join(runtimeRoot, required))) {
        failures.push(`${mode} is missing ${required}`);
      }
    }
  }

  const productionRoot = path.join(tempRoot, "production", "runtime");
  const demonstrationRoot = path.join(tempRoot, "demonstration", "runtime");
  const productionPackage = JSON.parse(
    fs.readFileSync(path.join(productionRoot, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  const demonstrationPackage = JSON.parse(
    fs.readFileSync(path.join(demonstrationRoot, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  if (productionPackage.scripts["demo:cue-sheet"]) {
    failures.push("production package exposes demonstration commands");
  }
  if (!demonstrationPackage.scripts["demo:cue-sheet"]) {
    failures.push("demonstration package is missing demonstration commands");
  }
  if (
    productionPackage.scripts["workflows:prepare"]
    || demonstrationPackage.scripts["workflows:prepare"]
  ) {
    failures.push("prepared runtimes expose repository-level bundle management commands");
  }
  if (fs.existsSync(path.join(productionRoot, "demo-dashboard"))) {
    failures.push("production runtime contains the demonstration dashboard");
  }
  if (!fs.existsSync(path.join(demonstrationRoot, "demo-dashboard"))) {
    failures.push("demonstration runtime is missing the dashboard");
  }

  const productionManifest = manifests.get("production")!;
  const demonstrationManifest = manifests.get("demonstration")!;
  if (productionManifest.emailPolicy.mode !== "authority-gated") {
    failures.push("production email policy is not authority-gated");
  }
  if (
    demonstrationManifest.emailPolicy.mode !== "preview-only"
    || demonstrationManifest.emailPolicy.sendAllowed
    || !demonstrationManifest.emailPolicy.requirement.includes("Never send")
  ) {
    failures.push("demonstration email policy is not preview-only/never-send");
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`✗ ${failure}`));
  process.exit(1);
}

console.log("✓ Production and demonstration runtime folders are self-contained");
console.log("✓ Credentials and required inputs are independently copied with mode 600");
console.log("✓ Demonstration email is preview-only and never-send");
