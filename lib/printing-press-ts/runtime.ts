import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export interface PressServiceConfig {
  service: string;
  baseUrl: string;
  tokenEnvVars: string[];
  authKeyUrl?: string;
  authInstructions?: string;
}

export interface StoredConfig {
  baseUrl: string;
  token?: string;
}

export function configPath(service: string): string {
  return path.join(os.homedir(), ".config", `${service}.json`);
}

export function readConfig(service: PressServiceConfig): StoredConfig | null {
  const filePath = configPath(service.service);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as StoredConfig;
}

export function writeConfig(service: PressServiceConfig, config: StoredConfig): string {
  const filePath = configPath(service.service);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return filePath;
}

export function resolveBaseUrl(service: PressServiceConfig): string {
  return process.env[`${service.service.toUpperCase().replaceAll("-", "_")}_BASE_URL`] || readConfig(service)?.baseUrl || service.baseUrl;
}

export function resolveBearerToken(service: PressServiceConfig): { token: string | null; source: string | null } {
  for (const envVar of service.tokenEnvVars) {
    if (process.env[envVar]) return { token: process.env[envVar]!, source: `env:${envVar}` };
  }
  const stored = readConfig(service);
  if (stored?.token) return { token: stored.token, source: `config:${configPath(service.service)}` };
  return { token: null, source: null };
}

export function mask(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function showAuthSetup(service: PressServiceConfig, launch: boolean): void {
  if (launch && service.authKeyUrl) {
    spawnSync("open", [service.authKeyUrl], { stdio: "ignore" });
  }
  printJson({
    service: service.service,
    auth: "bearer",
    auth_key_url: service.authKeyUrl || null,
    auth_instructions: service.authInstructions || null,
    token_env_vars: service.tokenEnvVars,
    config_path: configPath(service.service),
  });
}

export async function probeBearerStatus(service: PressServiceConfig, probeUrl?: string): Promise<void> {
  const { token, source } = resolveBearerToken(service);
  const baseUrl = resolveBaseUrl(service);
  if (!token) {
    printJson({
      status: "missing_auth",
      service: service.service,
      base_url: baseUrl,
      token_env_vars: service.tokenEnvVars,
      config_path: configPath(service.service),
      next_step: "Run auth setup and provide a bearer token via env or config.",
    });
    process.exit(1);
  }
  if (!probeUrl) {
    printJson({
      status: "configured",
      service: service.service,
      base_url: baseUrl,
      auth: "bearer",
      token_source: source,
      token: mask(token),
      probe: "skipped",
    });
    return;
  }

  const response = await fetch(probeUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  printJson({
    status: response.ok ? "reachable" : "error",
    service: service.service,
    probe_url: probeUrl,
    status_code: response.status,
    token_source: source,
  });
  process.exit(response.ok ? 0 : 1);
}
