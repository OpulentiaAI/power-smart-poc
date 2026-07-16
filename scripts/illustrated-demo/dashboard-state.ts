#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

type Workflow = "order" | "warranty" | "sps-bol";
type SceneStatus = "pending" | "running" | "success" | "blocked" | "skipped";

interface CueScene {
  id: string;
  title: string;
  camera: string;
  clientQuestion: string;
  manualMinutes: number;
  automatedMinutes: number;
}

interface DashboardScene extends CueScene {
  status: SceneStatus;
  evidence?: string;
  updatedAt?: string;
}

interface DashboardState {
  version: 1;
  mode: "illustration";
  workflow: Workflow;
  runId: string;
  title: string;
  status: "ready" | "running" | "success" | "blocked";
  updatedAt: string;
  startedAt: string;
  scenes: DashboardScene[];
  recordIds: string[];
  artifacts: string[];
  events: Array<{
    at: string;
    sceneId?: string;
    status: SceneStatus | "ready";
    message: string;
  }>;
}

const estimateDefaults: Record<Workflow, Array<[number, number]>> = {
  order: [[5, 1], [8, 1], [4, 1], [6, 1], [4, 1], [5, 1]],
  warranty: [[7, 1], [10, 1], [5, 1], [7, 1], [4, 1], [8, 2]],
  "sps-bol": [[8, 1], [25, 2], [20, 2], [35, 3], [10, 1], [8, 1]],
};

function estimatesFor(workflow: Workflow, scene: CueScene, index: number) {
  const fallback = estimateDefaults[workflow][index] ?? [0, 0];
  return {
    manualMinutes: Number.isFinite(scene.manualMinutes) ? scene.manualMinutes : fallback[0],
    automatedMinutes: Number.isFinite(scene.automatedMinutes) ? scene.automatedMinutes : fallback[1],
  };
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function isWorkflow(value: string | undefined): value is Workflow {
  return value === "order" || value === "warranty" || value === "sps-bol";
}

function isSceneStatus(value: string | undefined): value is SceneStatus {
  return value === "pending" || value === "running" || value === "success" || value === "blocked" || value === "skipped";
}

const args = process.argv.slice(2);
const workflow = argValue(args, "--workflow");
const runId = argValue(args, "--run-id");
const sceneId = argValue(args, "--scene");
const requestedStatus = argValue(args, "--status");
const evidence = argValue(args, "--evidence");
const recordId = argValue(args, "--record-id");
const artifact = argValue(args, "--artifact");
const message = argValue(args, "--message");
const outputRoot = path.resolve(argValue(args, "--out") ?? "artifacts/illustrated-demo");
const dashboardPath = path.resolve(argValue(args, "--dashboard-state") ?? "demo-dashboard/public/dashboard-state.json");

if (!isWorkflow(workflow) || !runId) {
  console.error("Usage: npm run demo:dashboard:update -- --workflow <order|warranty|sps-bol> --run-id <slug> [--scene <id> --status <running|success|blocked|skipped>]");
  process.exit(1);
}

const cuePath = path.join(outputRoot, runId, "cue-sheet.json");
if (!fs.existsSync(cuePath)) {
  console.error(`Cue sheet not found: ${cuePath}. Run demo:cue-sheet first.`);
  process.exit(1);
}

const cue = JSON.parse(fs.readFileSync(cuePath, "utf8")) as {
  workflow: Workflow;
  evidenceRibbonTitle: string;
  scenes: CueScene[];
};

if (cue.workflow !== workflow) {
  console.error(`Cue sheet workflow is ${cue.workflow}, not ${workflow}.`);
  process.exit(1);
}

const runStatePath = path.join(outputRoot, runId, "dashboard-state.json");
const now = new Date().toISOString();
let state: DashboardState;

if (fs.existsSync(runStatePath)) {
  state = JSON.parse(fs.readFileSync(runStatePath, "utf8")) as DashboardState;
} else {
  state = {
    version: 1,
    mode: "illustration",
    workflow,
    runId,
    title: cue.evidenceRibbonTitle,
    status: "ready",
    updatedAt: now,
    startedAt: now,
    scenes: cue.scenes.map((scene, index) => ({
      ...scene,
      ...estimatesFor(workflow, scene, index),
      status: "pending",
    })),
    recordIds: [],
    artifacts: [],
    events: [{ at: now, status: "ready", message: "Cue sheet loaded; live systems are standing by." }],
  };
}

state.scenes = state.scenes.map((scene, index) => {
  const currentCue = cue.scenes.find((item) => item.id === scene.id) ?? scene;
  return {
    ...scene,
    ...estimatesFor(workflow, currentCue, index),
  };
});

if (sceneId) {
  if (!isSceneStatus(requestedStatus)) {
    console.error("--status is required with --scene.");
    process.exit(1);
  }
  const scene = state.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    console.error(`Unknown scene ${sceneId}.`);
    process.exit(1);
  }
  scene.status = requestedStatus;
  scene.updatedAt = now;
  if (evidence) scene.evidence = evidence;
  state.events.push({
    at: now,
    sceneId,
    status: requestedStatus,
    message: message ?? `${scene.title}: ${requestedStatus}`,
  });
}

if (recordId && !state.recordIds.includes(recordId)) state.recordIds.push(recordId);
if (artifact && !state.artifacts.includes(artifact)) state.artifacts.push(artifact);

state.updatedAt = now;
state.status = state.scenes.some((scene) => scene.status === "blocked")
  ? "blocked"
  : state.scenes.every((scene) => scene.status === "success" || scene.status === "skipped")
    ? "success"
    : state.scenes.some((scene) => scene.status === "running" || scene.status === "success")
      ? "running"
      : "ready";

fs.mkdirSync(path.dirname(runStatePath), { recursive: true });
fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
const serialized = `${JSON.stringify(state, null, 2)}\n`;
fs.writeFileSync(runStatePath, serialized);
fs.writeFileSync(dashboardPath, serialized);

console.log(JSON.stringify({
  status: state.status,
  workflow,
  runId,
  scene: sceneId ?? null,
  dashboardState: dashboardPath,
  runState: runStatePath,
}, null, 2));
