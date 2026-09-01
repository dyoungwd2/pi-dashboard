import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const monitoringKey =
  process.env.PI_DASHBOARD_SSH_KEY ??
  "/home/kira/.ssh/pi-dashboard-monitor";
let cachedRpcInfo: Record<string, unknown> | null = null;

const remoteMiningStatusCommand = [
  "printf 'MONEROD='; systemctl is-active monerod 2>/dev/null || true",
].join("; ");

function readValue(output: string, key: string) {
  return (
    output
      .split("\n")
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1) ?? ""
  );
}

function stripTerminalColors(value: string) {
  let clean = "";
  let inEscapeSequence = false;

  for (const character of value) {
    if (character.charCodeAt(0) === 27) {
      inEscapeSequence = true;
      continue;
    }

    if (inEscapeSequence) {
      if (/[A-Za-z]/.test(character)) {
        inEscapeSequence = false;
      }
      continue;
    }

    clean += character;
  }

  return clean;
}

async function getServiceStatus(service: string) {
  try {
    const { stdout } = await execFileAsync(
      "systemctl",
      ["is-active", service],
      {
        encoding: "utf8",
        timeout: 2000,
      }
    );

    return stdout.trim();
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    return stdout?.trim() || "unknown";
  }
}

function checkLocalPort(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port,
    });

    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(1500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

type XmrigStatus = {
  running: boolean;
  serviceStatus: string;
  cpuPercent: number;
  memoryPercent: number;
  hashRateHps: number | null;
};

async function getXmrigProcessUsage() {
  try {
    const { stdout: mainPidOutput } = await execFileAsync(
      "systemctl",
      ["show", "xmrig", "--property=MainPID", "--value"],
      {
        encoding: "utf8",
        timeout: 2000,
      }
    );
    const mainPid = Number(mainPidOutput.trim());

    if (!mainPid) {
      throw new Error("XMRig has no active process");
    }

    const { stdout } = await execFileAsync(
      "ps",
      ["-p", String(mainPid), "-o", "%cpu=,%mem="],
      {
        encoding: "utf8",
        timeout: 2000,
      }
    );

    const [cpuPercent = 0, memoryPercent = 0] = stdout
      .trim()
      .split(/\s+/)
      .map(Number);

    return {
      cpuPercent: Number(cpuPercent.toFixed(1)),
      memoryPercent: Number(memoryPercent.toFixed(1)),
    };
  } catch {
    return {
      cpuPercent: 0,
      memoryPercent: 0,
    };
  }
}

async function getXmrigHashRate() {
  try {
    const { stdout } = await execFileAsync(
      "journalctl",
      ["-u", "xmrig", "--no-pager", "-n", "200", "-o", "cat"],
      {
        encoding: "utf8",
        timeout: 2500,
      }
    );

    const speedLine = stripTerminalColors(stdout)
      .split("\n")
      .reverse()
      .find((line) => line.includes("speed 10s/60s/15m"));
    const match = speedLine?.match(
      /speed\s+10s\/60s\/15m\s+[\d.]+\s+([\d.]+)\s+[\d.]+\s+H\/s/
    );

    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function getLocalXmrigStatus(): Promise<XmrigStatus> {
  const [serviceStatus, usage, hashRateHps] = await Promise.all([
    getServiceStatus("xmrig"),
    getXmrigProcessUsage(),
    getXmrigHashRate(),
  ]);
  const running = serviceStatus === "active";

  return {
    running,
    serviceStatus,
    ...usage,
    hashRateHps: running ? hashRateHps : null,
  };
}

async function getRemoteMiningOutput() {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "ssh",
        [
          "-F",
          "/dev/null",
          "-i",
          monitoringKey,
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=4",
          "-o",
          "StrictHostKeyChecking=yes",
          "kira@192.168.6.128",
          remoteMiningStatusCommand,
        ],
        {
          encoding: "utf8",
          timeout: 12000,
        }
      );

      return stdout;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function getMoneroRpcInfo() {
  const response = await fetch(
    "http://192.168.6.128:18081/json_rpc",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dashboard",
        method: "get_info",
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Monero RPC returned ${response.status}`);
  }

  const rpcResponse = (await response.json()) as {
    result?: Record<string, unknown>;
  };

  return rpcResponse.result ?? null;
}

export async function GET() {
  try {
    const [
      remoteOutput,
      freshRpcInfo,
      p2poolServiceStatus,
      stratumReady,
      xmrig,
    ] =
      await Promise.all([
        getRemoteMiningOutput().catch((error) => {
          console.warn("[api/mining] monerod host unavailable", {
            error: String(error),
          });
          return null;
        }),
        getMoneroRpcInfo().catch(() => null),
        getServiceStatus("p2pool"),
        checkLocalPort(3333),
        getLocalXmrigStatus(),
      ]);

    const stdout = remoteOutput ?? "";

    if (freshRpcInfo) {
      cachedRpcInfo = freshRpcInfo;
    }

    const rpcInfo = freshRpcInfo ?? cachedRpcInfo;
    const incomingPeers = Number(
      rpcInfo?.incoming_connections_count ?? 0
    );
    const outgoingPeers = Number(
      rpcInfo?.outgoing_connections_count ?? 0
    );
    const height =
      typeof rpcInfo?.height === "number" ? rpcInfo.height : null;
    const targetHeight =
      typeof rpcInfo?.target_height === "number"
        ? rpcInfo.target_height
        : null;

    return NextResponse.json({
      monero: {
        serviceStatus: remoteOutput
          ? readValue(stdout, "MONEROD")
          : "unavailable",
        rpcAvailable: rpcInfo !== null,
        rpcStale: freshRpcInfo === null && rpcInfo !== null,
        synchronized:
          typeof rpcInfo?.synchronized === "boolean"
            ? rpcInfo.synchronized
            : null,
        height,
        targetHeight,
        syncPercent:
          height !== null && targetHeight
            ? Number(
                Math.min(100, (height / targetHeight) * 100).toFixed(1)
              )
            : null,
        peers: rpcInfo ? incomingPeers + outgoingPeers : null,
      },
      p2pool: {
        running: p2poolServiceStatus === "active",
        serviceStatus: p2poolServiceStatus,
        stratumReady,
      },
      xmrig,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/mining] status check failed", {
      error: String(error),
    });

    return NextResponse.json(
      {
        error: "Unable to check mining services",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
