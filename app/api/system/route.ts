import { NextResponse } from "next/server";
import { execFileSync } from "child_process";
import os from "os";

function getCpuTemp() {
  try {
    const raw = execFileSync("cat", [
      "/sys/class/thermal/thermal_zone0/temp",
    ])
      .toString()
      .trim();

    return Number(raw) / 1000;
  } catch {
    return null;
  }
}

function getDiskUsage() {
  try {
    const output = execFileSync("df", [
      "-P",
      "/",
    ])
      .toString()
      .trim()
      .split("\n");

    const fields = output[1].split(/\s+/);

    return {
      totalKb: Number(fields[1]),
      usedKb: Number(fields[2]),
      availableKb: Number(fields[3]),
      percent: Number(fields[4].replace("%", "")),
    };
  } catch {
    return null;
  }
}

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

export async function GET() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  const memoryPercent = Math.round(
    (usedMemory / totalMemory) * 100
  );

  const cpuTemp = getCpuTemp();
  const disk = getDiskUsage();

  return NextResponse.json({
    cpuTemp:
      cpuTemp !== null
        ? Number(cpuTemp.toFixed(1))
        : null,

    memory: {
      percent: memoryPercent,
      totalGb: Number(
        (totalMemory / 1024 ** 3).toFixed(1)
      ),
      usedGb: Number(
        (usedMemory / 1024 ** 3).toFixed(1)
      ),
    },

    storage: disk,

    uptime: formatUptime(os.uptime()),

    hostname: os.hostname(),

    cpuCount: os.cpus().length,

    loadAverage: os.loadavg().map((load) =>
      Number(load.toFixed(2))
    ),

    checkedAt: new Date().toISOString(),
  });
}
