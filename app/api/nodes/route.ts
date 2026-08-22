import { NextResponse } from "next/server";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const monitoringKey =
  process.env.PI_DASHBOARD_SSH_KEY ??
  "/home/kira/.ssh/pi-dashboard-monitor";

type MonitoredNode = {
  key: string;
  host: string;
  port: number;
} & (
  | { local: true }
  | { local: false; user: string }
);

const nodes: MonitoredNode[] = [
  {
    key: "raspberrypi",
    host: "192.168.6.127",
    port: 22,
    local: true,
  },
  {
    key: "umbrel",
    host: "192.168.6.122",
    port: 80,
    local: false,
    user: "umbrel",
  },
  {
    key: "rasp-pi4",
    host: "192.168.6.128",
    port: 22,
    local: false,
    user: "kira",
  },
];

type NodeMetrics = {
  temperature: number | null;
  memoryPercent: number;
  storagePercent: number;
  uptime: string;
  load: number;
  cpuCount: number;
};

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getLocalMetrics(): NodeMetrics {
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();

  let temperature: number | null = null;
  let storagePercent = 0;

  try {
    const rawTemperature = Number(
      readFileSync(
        "/sys/class/thermal/thermal_zone0/temp",
        "utf8"
      ).trim()
    );

    temperature = Number((rawTemperature / 1000).toFixed(1));
  } catch {
    temperature = null;
  }

  try {
    const diskLine = execFileSync("df", ["-P", "/"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")[1];

    storagePercent = Number(
      diskLine.split(/\s+/)[4].replace("%", "")
    );
  } catch {
    storagePercent = 0;
  }

  return {
    temperature,
    memoryPercent: Math.round(
      (usedMemory / totalMemory) * 100
    ),
    storagePercent,
    uptime: formatUptime(os.uptime()),
    load: Number(os.loadavg()[0].toFixed(2)),
    cpuCount: os.cpus().length,
  };
}

const remoteMetricsCommand = [
  "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || printf '0\\n'",
  "awk '/MemTotal/ {total=$2} /MemAvailable/ {available=$2} END {printf \"%.0f\\n\", ((total - available) / total) * 100}' /proc/meminfo",
  "df -P / | awk 'NR == 2 {gsub(\"%\", \"\", $5); print $5}'",
  "cut -d. -f1 /proc/uptime",
  "cut -d' ' -f1 /proc/loadavg",
  "nproc",
].join("; ");

async function getRemoteMetrics(
  user: string,
  host: string
): Promise<NodeMetrics | null> {
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
        `${user}@${host}`,
        remoteMetricsCommand,
      ],
      {
        encoding: "utf8",
        timeout: 6000,
      }
    );

    const [temperature, memory, storage, uptime, load, cpuCount] =
      stdout.trim().split("\n");

    if (!load) {
      return null;
    }

    const rawTemperature = Number(temperature);

    return {
      temperature:
        rawTemperature > 0
          ? Number((rawTemperature / 1000).toFixed(1))
          : null,
      memoryPercent: Number(memory),
      storagePercent: Number(storage),
      uptime: formatUptime(Number(uptime)),
      load: Number(Number(load).toFixed(2)),
      cpuCount: Number(cpuCount),
    };
  } catch {
    return null;
  }
}

function checkNode(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (online: boolean) => {
      socket.destroy();
      resolve(online);
    };

    socket.setTimeout(2500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function GET() {
  const results = await Promise.all(
    nodes.map(async (node) => {
      const [online, metrics] = await Promise.all([
        checkNode(node.host, node.port),
        node.local
          ? Promise.resolve(getLocalMetrics())
          : getRemoteMetrics(node.user, node.host),
      ]);

      return {
        key: node.key,
        online,
        metrics,
      };
    })
  );

  return NextResponse.json({
    nodes: Object.fromEntries(
      results.map((node) => [node.key, node.online])
    ),
    metrics: Object.fromEntries(
      results.map((node) => [node.key, node.metrics])
    ),
    checkedAt: new Date().toISOString(),
  });
}
