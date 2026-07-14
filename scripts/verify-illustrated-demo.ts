#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const skillPath = path.join(repoRoot, ".agents/skills/power-smart-illustrated-demo/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf8");
const failures: string[] = [];

for (const dashboardFile of [
  "demo-dashboard/src/App.tsx",
  "demo-dashboard/src/components/dither-kit/area-chart.tsx",
  "demo-dashboard/public/dashboard-state.json",
]) {
  if (!fs.existsSync(path.join(repoRoot, dashboardFile))) {
    failures.push(`dashboard file is missing: ${dashboardFile}`);
  }
}

for (const required of [
  "not a second automation engine",
  "production skills remain authoritative",
  "browser_manage",
  "computer_manage",
  "run_command",
  "document_manage",
  "evidence ribbon",
  "source → decision → destination",
  "real credentials",
  "demo:dashboard:update",
  "demo:acumatica:prepare",
  "Dither Kit dashboard",
]) {
  if (!skill.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`illustrated-demo skill is missing ${JSON.stringify(required)}`);
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "power-smart-demo-"));

try {
  for (const workflow of ["order", "warranty", "sps-bol"]) {
    const runId = `verify-${workflow}`;
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/illustrated-demo/cue-sheet.ts",
        "--workflow",
        workflow,
        "--run-id",
        runId,
        "--out",
        tempRoot,
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );

    const cuePath = path.join(tempRoot, runId, "cue-sheet.json");
    const storyboardPath = path.join(tempRoot, runId, "storyboard.md");
    const cue = JSON.parse(fs.readFileSync(cuePath, "utf8")) as {
      mode: string;
      productionSemantics: string;
      scenes: Array<{
        camera: string;
        clientQuestion: string;
        proof: string;
        manualMinutes: number;
        automatedMinutes: number;
      }>;
    };

    if (cue.mode !== "illustration" || cue.productionSemantics !== "unchanged") {
      failures.push(`${workflow} cue sheet does not preserve production semantics`);
    }
    if (cue.scenes.length < 5 || !fs.existsSync(storyboardPath)) {
      failures.push(`${workflow} cue sheet is incomplete`);
    }
    if (cue.scenes.some((scene) => !scene.clientQuestion || !scene.proof)) {
      failures.push(`${workflow} has a scene without a question or proof slot`);
    }
    if (cue.scenes.some((scene) => !Number.isFinite(scene.manualMinutes) || !Number.isFinite(scene.automatedMinutes))) {
      failures.push(`${workflow} has a scene without finite time estimates`);
    }

    const dashboardPath = path.join(tempRoot, `${runId}-dashboard.json`);
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/illustrated-demo/dashboard-state.ts",
        "--workflow",
        workflow,
        "--run-id",
        runId,
        "--scene",
        "01",
        "--status",
        "success",
        "--evidence",
        "verified",
        "--out",
        tempRoot,
        "--dashboard-state",
        dashboardPath,
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
    const dashboard = fs.readFileSync(dashboardPath, "utf8");
    if (dashboard.includes("NaN") || !dashboard.includes("\"manualMinutes\"")) {
      failures.push(`${workflow} dashboard state has invalid estimates`);
    }
  }

  const envPath = path.join(tempRoot, "credentials.env");
  const sessionDir = path.join(tempRoot, "session");
  fs.writeFileSync(envPath, [
    "ACUMATICA_BASE_URL=https://example.com/(W(3))/Frames/Login.aspx?ReturnUrl=%2fMain",
    "ACUMATICA_TENANT=Test",
    "ACUMATICA_USERNAME=demo",
    "ACUMATICA_PASSWORD=secret",
  ].join("\n"));
  const prepared = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/illustrated-demo/prepare-acumatica.ts",
      "--env-file",
      envPath,
      "--session-dir",
      sessionDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (prepared.includes("secret")) failures.push("credential preparation exposed the password");
  const configPath = path.join(sessionDir, ".acumatica-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { baseUrl: string };
  if (config.baseUrl !== "https://example.com") failures.push("credential preparation did not normalize the login URL");

  const caseUrlOutput = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/acumatica/cli.ts", "url", "case", "CS17617", "--quiet"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ACUMATICA_CONFIG: configPath,
        HOME: sessionDir,
      },
    },
  );
  const caseUrl = JSON.parse(caseUrlOutput) as { url: string };
  if (!caseUrl.url.includes("CaseCD=CS17617")) {
    failures.push("Acumatica case deep link does not use CaseCD");
  }

  const payloadOutput = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/illustrated-demo/prepare-live-payload.ts",
      "--input",
      "fixtures/sample-order-intake.txt",
      "--run-id",
      "unique-payload",
      "--unique",
      "--out",
      tempRoot,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const payloadResult = JSON.parse(payloadOutput) as {
    unique: boolean;
    orderNumber: string;
    serialNumber: string;
    payload: string;
  };
  if (
    !payloadResult.unique
    || !/^\d{12}$/.test(payloadResult.orderNumber)
    || !/^\d{19}$/.test(payloadResult.serialNumber)
    || !fs.existsSync(payloadResult.payload)
  ) {
    failures.push("unique rehearsal payload preparation is invalid");
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`✗ ${failure}`));
  process.exit(1);
}

console.log("✓ Illustrated demo is opt-in and preserves production semantics");
console.log("✓ Cue sheets, live dashboard state, credential prep, and Acumatica deep links are complete");
