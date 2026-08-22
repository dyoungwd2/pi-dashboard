import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const monitoringKey =
  process.env.PI_DASHBOARD_SSH_KEY ??
  "/home/kira/.ssh/pi-dashboard-monitor";
let cachedRpcInfo: Record<string, unknown> | null = null;

const miningStatusCommand = [
  "printf 'MONEROD='; systemctl is-active monerod 2>/dev/null || true",
  "printf 'P2POOL='; if pgrep -x p2pool >/dev/null; then printf 'active\\n'; else printf 'inactive\\n'; fi",
  "printf 'P2POOL_PORT='; if ss -ltn 2>/dev/null | grep -q ':3333 '; then printf 'open\\n'; else printf 'closed\\n'; fi",
  "printf 'XMRIG='; if pgrep -x xmrig >/dev/null; then printf 'active\\n'; else printf 'inactive\\n'; fi",
  "printf 'XMRIG_CPU='; ps -C xmrig -o %cpu= 2>/dev/null | awk '{sum += $1} END {printf \"%.1f\\n\", sum}'",
  "printf 'XMRIG_MEMORY='; ps -C xmrig -o %mem= 2>/dev/null | awk '{sum += $1} END {printf \"%.1f\\n\", sum}'",
  "printf 'RPC='; curl --silent --max-time 8 -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":\"dashboard\",\"method\":\"get_info\"}' http://127.0.0.1:18081/json_rpc | tr -d '\\n' || true; printf '\\n'",
].join("; ");

function readValue(output: string, key: string) {
  return (
    output
      .split("\n")
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1) ?? ""
  );
}

type XmrigStatus = {
  running: boolean;
  cpuPercent: number;
  memoryPercent: number;
};

async function getLocalXmrigStatus(): Promise<XmrigStatus> {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-C", "xmrig", "-o", "%cpu=,%mem="],
      {
        encoding: "utf8",
        timeout: 2000,
      }
    );

    const processes = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/).map(Number));

    return {
      running: processes.length > 0,
      cpuPercent: Number(
        processes
          .reduce((total, process) => total + process[0], 0)
          .toFixed(1)
      ),
      memoryPercent: Number(
        processes
          .reduce((total, process) => total + process[1], 0)
          .toFixed(1)
      ),
    };
  } catch {
    return {
      running: false,
      cpuPercent: 0,
      memoryPercent: 0,
    };
  }
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
          miningStatusCommand,
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

export async function GET() {
  try {
    const [stdout, localXmrig] = await Promise.all([
      getRemoteMiningOutput(),
      getLocalXmrigStatus(),
    ]);

    const rawRpc = readValue(stdout, "RPC");
    let freshRpcInfo: Record<string, unknown> | null = null;

    if (rawRpc) {
      try {
        const rpcResponse = JSON.parse(rawRpc) as {
          result?: Record<string, unknown>;
        };

        freshRpcInfo = rpcResponse.result ?? null;
      } catch {
        freshRpcInfo = null;
      }
    }

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
      typeof rpcInfo?.height === "number"
        ? rpcInfo.height
        : null;
    const targetHeight =
      typeof rpcInfo?.target_height === "number"
        ? rpcInfo.target_height
        : null;

    return NextResponse.json({
      monero: {
        serviceStatus: readValue(stdout, "MONEROD"),
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
                Math.min(
                  100,
                  (height / targetHeight) * 100
                ).toFixed(1)
              )
            : null,
        peers: rpcInfo
          ? incomingPeers + outgoingPeers
          : null,
      },
      p2pool: {
        running: readValue(stdout, "P2POOL") === "active",
        stratumReady:
          readValue(stdout, "P2POOL_PORT") === "open",
      },
      xmrig: {
        raspberrypi: localXmrig,
        raspPi4: {
          running: readValue(stdout, "XMRIG") === "active",
          cpuPercent: Number(
            readValue(stdout, "XMRIG_CPU") || 0
          ),
          memoryPercent: Number(
            readValue(stdout, "XMRIG_MEMORY") || 0
          ),
        },
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/mining] status check failed", {
      error: String(error),
    });

    return NextResponse.json(
      {
        error: "Unable to reach mining host",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
