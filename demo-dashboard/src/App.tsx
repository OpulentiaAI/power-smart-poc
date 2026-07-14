import { useEffect, useMemo, useState } from "react";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { DitherAvatar } from "@/components/dither-kit/avatar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Bar } from "@/components/dither-kit/bar";
import { DitherGradient } from "@/components/dither-kit/gradient";
import { Legend } from "@/components/dither-kit/legend";
import { Sparkline } from "@/components/dither-kit/sparkline";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";

type SceneStatus = "pending" | "running" | "success" | "blocked" | "skipped";

interface Scene {
  id: string;
  title: string;
  camera: string;
  clientQuestion: string;
  manualMinutes: number;
  automatedMinutes: number;
  status: SceneStatus;
  evidence?: string;
}

interface DashboardState {
  workflow: "order" | "warranty" | "sps-bol";
  runId: string;
  title: string;
  status: "ready" | "running" | "success" | "blocked";
  updatedAt: string;
  scenes: Scene[];
  recordIds: string[];
  artifacts: string[];
  events: Array<{
    at: string;
    sceneId?: string;
    status: SceneStatus | "ready";
    message: string;
  }>;
}

const systemLabels: Record<DashboardState["workflow"], Array<{ label: string; scenes: string[] }>> = {
  order: [
    { label: "Outlook / intake", scenes: ["01"] },
    { label: "Extraction + gates", scenes: ["02", "03"] },
    { label: "Acumatica", scenes: ["04", "05"] },
    { label: "Evidence ribbon", scenes: ["06"] },
  ],
  warranty: [
    { label: "Outlook / proof", scenes: ["01"] },
    { label: "Warranty gates", scenes: ["02", "03"] },
    { label: "Acumatica", scenes: ["04", "05"] },
    { label: "Customer response", scenes: ["06"] },
  ],
  "sps-bol": [
    { label: "LibreOffice / XLSX", scenes: ["01"] },
    { label: "Transform + validation", scenes: ["02", "03"] },
    { label: "BOL files", scenes: ["04", "05"] },
    { label: "Evidence ribbon", scenes: ["06"] },
  ],
};

const statusClass = {
  ready: "text-zinc-500",
  pending: "text-zinc-500",
  running: "text-cyan-400",
  success: "text-emerald-400",
  blocked: "text-red-400",
  skipped: "text-orange-400",
} as const;

function formatWorkflow(workflow: DashboardState["workflow"]) {
  if (workflow === "sps-bol") return "SPS BOL";
  return workflow[0].toUpperCase() + workflow.slice(1);
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function finite(value: number | undefined) {
  return Number.isFinite(value) ? value! : 0;
}

function compactEvidencePath(value: string) {
  const parts = value.split("/");
  return parts.slice(-2).join("/");
}

export function App() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [connection, setConnection] = useState<"live" | "stale">("live");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/dashboard-state.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("state unavailable");
        const next = await response.json() as DashboardState;
        if (active) {
          setData(next);
          setConnection("live");
        }
      } catch {
        if (active) setConnection("stale");
      }
    };
    void load();
    const timer = window.setInterval(load, 750);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const metrics = useMemo(() => {
    if (!data) return null;
    const completed = data.scenes.filter((scene) => scene.status === "success").length;
    const blocked = data.scenes.filter((scene) => scene.status === "blocked").length;
    const manual = data.scenes.reduce((sum, scene) => sum + finite(scene.manualMinutes), 0);
    const automated = data.scenes.reduce((sum, scene) => sum + finite(scene.automatedMinutes), 0);
    const projectedSaved = Math.max(0, manual - automated);
    let cumulativeSaved = 0;
    const chart = data.scenes.map((scene) => {
      if (scene.status === "success") {
        cumulativeSaved += finite(scene.manualMinutes) - finite(scene.automatedMinutes);
      }
      return {
        scene: scene.id,
        manual: finite(scene.manualMinutes),
        automated: finite(scene.automatedMinutes),
        saved: cumulativeSaved,
      };
    });
    return { completed, blocked, manual, automated, projectedSaved, chart };
  }, [data]);

  if (!data || !metrics) {
    return <main className="grid min-h-dvh place-items-center bg-[#09090b] text-zinc-400">Loading live workflow…</main>;
  }

  const areaConfig = {
    saved: { label: "Minutes saved", color: "green" as const },
  };
  const barConfig = {
    manual: { label: "Manual", color: "orange" as const },
    automated: { label: "Automated", color: "blue" as const },
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#09090b] px-5 py-5 text-zinc-100 md:px-8">
      <DitherGradient from="blue" direction="down" className="opacity-20" />
      <div className="relative mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-col justify-between gap-4 border-b border-zinc-800 pb-5 md:flex-row md:items-end">
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-400">
              Power Smart / illustrated operations
            </p>
            <h1 className="text-balance font-mono text-3xl font-semibold tracking-[-0.04em] md:text-5xl">
              {formatWorkflow(data.workflow)} workflow
            </h1>
            <p className="mt-2 font-mono text-xs text-zinc-500">{data.runId}</p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className={`h-2 w-2 rounded-full ${connection === "live" ? "bg-emerald-400 shadow-[0_0_14px_#34d399]" : "bg-red-400"}`} />
            <span className="uppercase tracking-[0.18em] text-zinc-400">{connection}</span>
            <span className="text-zinc-700">/</span>
            <span className="uppercase tracking-[0.18em] text-zinc-300">{data.status}</span>
            <span className="text-zinc-600">{formatClock(data.updatedAt)}</span>
          </div>
        </header>

        <SystemRail data={data} />

        <section className="mb-5 grid gap-px overflow-hidden border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Scenes complete" value={`${metrics.completed}/${data.scenes.length}`} detail={`${metrics.blocked} blocked`} spark={[0, metrics.completed, data.scenes.length]} color="blue" />
          <Metric label="Projected time saved" value={`${(metrics.projectedSaved / 60).toFixed(1)}h`} detail={`${metrics.projectedSaved} minutes`} spark={metrics.chart.map((item) => item.saved)} color="green" />
          <Metric label="Manual baseline" value={`${metrics.manual}m`} detail="Conservative estimate" spark={metrics.chart.map((item) => item.manual)} color="orange" />
          <Metric label="Estimated automation" value={`${metrics.automated}m`} detail="Scene baseline" spark={metrics.chart.map((item) => item.automated)} color="purple" />
          <Metric label="Evidence" value={`${data.artifacts.length + data.recordIds.length}`} detail={`${data.recordIds.length} system records`} spark={[0, data.artifacts.length, data.artifacts.length + data.recordIds.length]} color="pink" className="sm:col-span-2 lg:col-span-1" />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
          <section className="border border-zinc-800 bg-black/55 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Live scene rail</p>
                <h2 className="mt-1 text-pretty font-mono text-lg">Source → decision → committed outcome</h2>
              </div>
              <DitherAvatar name={data.runId} size={42} hue={195} />
            </div>
            <ol className="space-y-2">
              {data.scenes.map((scene) => (
                <li key={scene.id} className={`grid grid-cols-[34px_1fr_auto] items-center gap-3 border px-3 py-3 ${scene.status === "running" ? "border-cyan-500/70 bg-cyan-500/5" : "border-zinc-800 bg-zinc-950/75"}`}>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">{scene.id}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-zinc-100">{scene.title}</span>
                      <span className="rounded-sm border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">{scene.camera}</span>
                    </div>
                    <p className="mt-1 text-pretty text-xs text-zinc-500">{scene.evidence ?? scene.clientQuestion}</p>
                  </div>
                  <span className={`font-mono text-[10px] uppercase tracking-widest ${statusClass[scene.status]}`}>
                    {scene.status}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid gap-5">
            <ChartCard eyebrow="Value curve" title="Cumulative minutes saved">
              <AreaChart data={metrics.chart} config={areaConfig} bloom="aura" className="h-[220px]">
                <XAxis dataKey="scene" />
                <YAxis />
                <Tooltip labelKey="scene" />
                <Area dataKey="saved" variant="gradient" />
              </AreaChart>
            </ChartCard>
            <ChartCard eyebrow="Time comparison" title="Manual vs automated by scene">
              <BarChart data={metrics.chart} config={barConfig} bloom="low" className="h-[220px]">
                <XAxis dataKey="scene" />
                <YAxis />
                <Legend />
                <Tooltip labelKey="scene" />
                <Bar dataKey="manual" variant="hatched" />
                <Bar dataKey="automated" variant="gradient" />
              </BarChart>
            </ChartCard>
          </div>
        </div>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="border border-zinc-800 bg-black/55 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">System evidence</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[...data.recordIds.map((value) => ({ type: "record", value })), ...data.artifacts.map((value) => ({ type: "artifact", value }))].map((item) => (
                <div key={`${item.type}-${item.value}`} className="border border-zinc-800 bg-zinc-950 px-3 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-400">{item.type}</p>
                  <p className="mt-1 font-mono text-xs text-zinc-300" title={item.value}>{compactEvidencePath(item.value)}</p>
                </div>
              ))}
              {data.recordIds.length + data.artifacts.length === 0 && (
                <p className="text-sm text-zinc-600">Evidence appears here as scenes settle.</p>
              )}
            </div>
          </div>
          <div className="border border-zinc-800 bg-black/55 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Latest activity</p>
            <div className="mt-3 space-y-2">
              {data.events.slice(-5).reverse().map((event) => (
                <div key={`${event.at}-${event.sceneId}-${event.message}`} className="grid grid-cols-[72px_1fr] gap-3 border-b border-zinc-900 pb-2 font-mono text-xs">
                  <span className="tabular-nums text-zinc-600">{formatClock(event.at)}</span>
                  <span className="text-zinc-300">{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SystemRail({ data }: { data: DashboardState }) {
  const systems = systemLabels[data.workflow].map((system) => {
    const statuses = data.scenes
      .filter((scene) => system.scenes.includes(scene.id))
      .map((scene) => scene.status);
    const status: SceneStatus = statuses.some((value) => value === "blocked")
      ? "blocked"
      : statuses.some((value) => value === "running")
        ? "running"
        : statuses.length > 0 && statuses.every((value) => value === "success" || value === "skipped")
          ? "success"
          : "pending";
    return { ...system, status };
  });

  return (
    <section className="mb-5 grid gap-px overflow-hidden border border-zinc-800 bg-zinc-800 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workflow systems">
      {systems.map((system) => (
        <div key={system.label} className="flex items-center justify-between bg-zinc-950 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-400">{system.label}</span>
          <span className={`font-mono text-[9px] uppercase tracking-widest ${statusClass[system.status]}`}>{system.status}</span>
        </div>
      ))}
    </section>
  );
}

function Metric({ label, value, detail, spark, color, className = "" }: { label: string; value: string; detail: string; spark: number[]; color: "blue" | "green" | "orange" | "purple" | "pink"; className?: string }) {
  return (
    <article className={`bg-zinc-950 p-4 ${className}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-3xl tabular-nums tracking-[-0.05em]">{value}</p>
          <p className="mt-1 text-[11px] text-zinc-600">{detail}</p>
        </div>
        <div className="h-10 w-24">
          <Sparkline data={spark.length > 1 ? spark : [0, ...spark]} color={color} bloom="aura" />
        </div>
      </div>
    </article>
  );
}

function ChartCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 bg-black/55 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>
      <h2 className="mt-1 mb-4 font-mono text-sm">{title}</h2>
      {children}
    </section>
  );
}
