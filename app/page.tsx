"use client";

import { useEffect, useRef, useState } from "react";

type SystemStats = {
  cpuTemp: number | null;
  memory: {
    percent: number;
    totalGb: number;
    usedGb: number;
  };
  storage: {
    totalKb: number;
    usedKb: number;
    availableKb: number;
    percent: number;
  } | null;
  uptime: string;
  hostname: string;
  cpuCount: number;
  loadAverage: number[];
  checkedAt: string;
};

type Service = {
  name: string;
  description: string;
  href: string;
  icon?: string;
  statusKey?: string;
};

type NodeStatusResponse = {
  nodes: Record<string, boolean>;
  metrics: Record<string, NodeMetrics | null>;
  checkedAt: string;
};

type ServiceStatusResponse = {
  statuses: Record<string, boolean>;
  checkedAt: string;
};

type NodeMetrics = {
  temperature: number | null;
  memoryPercent: number;
  storagePercent: number;
  uptime: string;
  load: number;
  cpuCount: number;
};

type MiningStatus = {
  monero: {
    serviceStatus: string;
    rpcAvailable: boolean;
    rpcStale: boolean;
    synchronized: boolean | null;
    height: number | null;
    targetHeight: number | null;
    syncPercent: number | null;
    peers: number | null;
  };
  p2pool: {
    running: boolean;
    stratumReady: boolean;
  };
  xmrig: {
    raspberrypi: XmrigStatus;
    raspPi4: XmrigStatus;
  };
  checkedAt: string;
};

type XmrigStatus = {
  running: boolean;
  cpuPercent: number;
  memoryPercent: number;
};

type SyncTrend = {
  blocksPerMinute: number | null;
  eta: string | null;
  stalled: boolean;
};

const services: Service[] = [
  {
    name: "ChatGPT",
    description: "AI Assistant",
    href: "https://chatgpt.com",
    icon: "https://chatgpt.com/favicon.ico",
  },

  {
    name: "Pironman",
    description: "System Dashboard",
    href: "http://localhost:34001",
    icon: "https://ezblock.cc/readDocFile/sunfounderIcon.png",
    statusKey: "pironman",
  },
  {
    name: "Umbrel Pi",
    description: "Home Server",
    href: "http://umbrel.local",
    icon: "https://framerusercontent.com/images/RdysUJrPhA8RsUU73jOKyFUD06E.png",
    statusKey: "umbrel",
  },
  {
    name: "Portainer",
    description: "Docker Management",
    href: "http://umbrel.local:9000",
    icon: "https://cdn.prod.website-files.com/69bc83ff083bf63749b6bdd8/69bc83ff083bf63749b6c1a1_Portainer%20-%20P%20Icon%20SQUARE%20-%20Purple%20%26%20Graphite%20(32x32).png",
    statusKey: "portainer",
  },
  {
    name: "Monero OwnBlock",
    description: "Monero Mining Dashboard",
    href: "/api/links/ownblock",
    icon: "https://xmr.ownblock.io/favicon.svg",
  },
  {
    name: "BTC NerdMiner",
    description: "NerdMiner Dashboard",
    href: "https://pool.nerdminer.io/",
    icon: "https://pool.nerdminer.io/favicon.svg",
  },
  {
    name: "SoloBTC",
    description: "NMMINER.com Dashboard",
    href: "https://solobtc.nmminer.com/#/app/bc1qzcr67g0vs6thjjs8q5m6asr6st3k48lq09fry9",
    icon: "https://solobtc.nmminer.com/favicon.ico",
  },
  {
    name: "BitBoard",
    description: "Live Crypto Prices",
    href: "http://umbrel.local:3711/",
    icon: "https://getumbrel.github.io/umbrel-apps-gallery/bitboard/icon.svg",
    statusKey: "bitboard",
  },
];

const quickActions = [
  {
    label: "Umbrel",
    href: "http://umbrel.local",
  },
  {
    label: "Pironman",
    href: "http://localhost:34001",
  },
  {
    label: "Portainer",
    href: "http://umbrel.local:9000",
  },
  {
    label: "OwnBlock",
    href: "/api/links/ownblock",
  },
  {
    label: "NerdMiner",
    href: "https://pool.nerdminer.io/",
  },
  {
    label: "SoloBTC",
    href: "https://solobtc.nmminer.com/#/app/bc1qzcr67g0vs6thjjs8q5m6asr6st3k48lq09fry9",
  },
];

const networkNodes = [
  {
    key: "raspberrypi",
    name: "raspberrypi",
    address: "192.168.6.127",
  },
  {
    key: "umbrel",
    name: "umbrel",
    address: "192.168.6.122",
  },
  {
    key: "rasp-pi4",
    name: "rasp-pi4",
    address: "192.168.6.128",
  },
];

const xmrigHosts = [
  {
    key: "raspberrypi" as const,
    label: "raspberrypi",
  },
  {
    key: "raspPi4" as const,
    label: "rasp-pi4",
  },
];

type AlertLevel = "normal" | "warning" | "critical";

function getTemperatureAlert(
  temperature: number | null
): AlertLevel {
  if (temperature === null) {
    return "normal";
  }

  if (temperature >= 80) {
    return "critical";
  }

  if (temperature >= 70) {
    return "warning";
  }

  return "normal";
}

function getStorageAlert(storagePercent: number): AlertLevel {
  if (storagePercent >= 90) {
    return "critical";
  }

  if (storagePercent >= 80) {
    return "warning";
  }

  return "normal";
}

function getLoadAlert(
  load: number,
  cpuCount: number
): AlertLevel {
  if (load >= cpuCount) {
    return "critical";
  }

  if (load >= cpuCount * 0.75) {
    return "warning";
  }

  return "normal";
}

function getNodeAlert(metrics: NodeMetrics): AlertLevel {
  const alerts = [
    getTemperatureAlert(metrics.temperature),
    getStorageAlert(metrics.storagePercent),
    getLoadAlert(metrics.load, metrics.cpuCount),
  ];

  if (alerts.includes("critical")) {
    return "critical";
  }

  if (alerts.includes("warning")) {
    return "warning";
  }

  return "normal";
}

function formatSyncEta(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  if (minutes < 60) {
    return `${Math.ceil(minutes)}m`;
  }

  const hours = minutes / 60;

  if (hours < 48) {
    return `${hours.toFixed(1)}h`;
  }

  return `${(hours / 24).toFixed(1)}d`;
}

export default function Home() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [serviceStatus, setServiceStatus] =
  useState<Record<string, boolean> | null>(null);
  const [servicesCheckedAt, setServicesCheckedAt] =
    useState<string | null>(null);
  const [nodeStatus, setNodeStatus] =
    useState<Record<string, boolean> | null>(null);
  const [nodeMetrics, setNodeMetrics] =
    useState<Record<string, NodeMetrics | null>>({});
  const [nodesCheckedAt, setNodesCheckedAt] =
    useState<string | null>(null);
  const [miningStatus, setMiningStatus] =
    useState<MiningStatus | null>(null);
  const [syncTrend, setSyncTrend] = useState<SyncTrend>({
    blocksPerMinute: null,
    eta: null,
    stalled: false,
  });
  const syncSamplesRef = useRef<
    Array<{ height: number; timestamp: number }>
  >([]);
  const stalledChecksRef = useRef(0);
  const [error, setError] = useState("");

  useEffect(() => {
    async function getStats() {
      try {
        const response = await fetch("/api/system", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("API request failed");
        }

        const data: SystemStats = await response.json();

        setStats(data);
        setError("");
      } catch (err) {
        console.error(err);
        setError("Unable to load system stats");
      }
    }

    async function getServiceStatus() {
      try {
        const response = await fetch("/api/services", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Service status request failed");
        }

        const data: ServiceStatusResponse =
          await response.json();

        setServiceStatus(data.statuses);
        setServicesCheckedAt(data.checkedAt);
      } catch (err) {
        console.error("Service status error:", err);
      }
    }

    async function getNodeStatus() {
      try {
        const response = await fetch("/api/nodes", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Node status request failed");
        }

        const data: NodeStatusResponse =
          await response.json();

        setNodeStatus(data.nodes);
        setNodeMetrics(data.metrics);
        setNodesCheckedAt(data.checkedAt);
      } catch (err) {
        console.error("Node status error:", err);
      }
    }

    async function getMiningStatus() {
      try {
        const response = await fetch("/api/mining", {
          cache: "no-store",
        });

        if (!response.ok) {
          console.warn(
            "Mining status temporarily unavailable"
          );
          return;
        }

        const data: MiningStatus = await response.json();
        setMiningStatus(data);

        if (!data.monero.rpcStale) {
          const { height, targetHeight, synchronized } =
            data.monero;

          if (synchronized) {
            syncSamplesRef.current = [];
            stalledChecksRef.current = 0;
            setSyncTrend({
              blocksPerMinute: 0,
              eta: "Complete",
              stalled: false,
            });
          } else if (height !== null && targetHeight !== null) {
            const timestamp = Date.parse(data.checkedAt);
            const previousSample = syncSamplesRef.current.at(-1);

            if (
              previousSample &&
              height < previousSample.height
            ) {
              syncSamplesRef.current = [];
            }

            if (
              previousSample &&
              height <= previousSample.height
            ) {
              stalledChecksRef.current += 1;
            } else {
              stalledChecksRef.current = 0;
            }

            syncSamplesRef.current = [
              ...syncSamplesRef.current,
              { height, timestamp },
            ]
              .filter(
                (sample) => timestamp - sample.timestamp <= 300000
              )
              .slice(-20);

            const oldestSample = syncSamplesRef.current[0];
            const newestSample = syncSamplesRef.current.at(-1);

            if (
              oldestSample &&
              newestSample &&
              newestSample.timestamp > oldestSample.timestamp
            ) {
              const elapsedMinutes =
                (newestSample.timestamp - oldestSample.timestamp) /
                60000;
              const blocksPerMinute =
                (newestSample.height - oldestSample.height) /
                elapsedMinutes;
              const remainingBlocks = Math.max(
                0,
                targetHeight - height
              );

              setSyncTrend({
                blocksPerMinute:
                  blocksPerMinute > 0
                    ? Number(blocksPerMinute.toFixed(1))
                    : 0,
                eta:
                  blocksPerMinute > 0
                    ? formatSyncEta(
                        remainingBlocks / blocksPerMinute
                      )
                    : null,
                stalled: stalledChecksRef.current >= 4,
              });
            }
          }
        }
      } catch (err) {
        console.warn("Mining status temporarily unavailable:", err);
      }
    }

    getStats();
    getServiceStatus();
    getNodeStatus();
    getMiningStatus();

    const statsTimer = setInterval(getStats, 5000);
    const serviceTimer = setInterval(
      getServiceStatus,
      15000
    );
    const nodeTimer = setInterval(getNodeStatus, 15000);
    const miningTimer = setInterval(
      getMiningStatus,
      15000
    );

    return () => {
      clearInterval(statsTimer);
      clearInterval(serviceTimer);
      clearInterval(nodeTimer);
      clearInterval(miningTimer);
    };
  }, []);

  return (
    <main className="dashboard">
      <section className="hero">
        <p className="eyebrow">
          RASPBERRY PI CONTROL CENTRE
        </p>

        <h1>Home Lab Dashboard</h1>

        <p className="subtitle">
          Local services and system monitoring
        </p>

        {stats && (
          <p className="systemInfo">
            {stats.hostname} | Load:{" "}
            {stats.loadAverage.join(" / ")}
          </p>
        )}
      </section>

      <h2>QUICK ACTIONS</h2>
      <section className="quickActions">
        {quickActions.map((action) => (
          <a
            key={action.label}
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="quickAction"
          >
            {action.label}
            <span aria-hidden="true">↗</span>
          </a>
        ))}

        <details className="sshQuickAction">
          <summary>SSH instructions</summary>
          <div>
            <code>ssh kira@192.168.6.127</code>
            <code>ssh umbrel@192.168.6.122</code>
            <code>ssh kira@192.168.6.128</code>
          </div>
        </details>
      </section>

      <h2>SERVICES</h2>
      <section className="serviceGrid">

        {services.map((service) => (
          <a
            key={service.name}
            href={service.href}
            target="_blank"
            rel="noopener noreferrer"
            className="serviceCard"
          >
            <div>
              <div className="serviceTitle">
                {service.icon && (
                  <img
                    src={service.icon}
                    alt=""
                    className="serviceIcon"
                  />
                )}

                <h2>{service.name}</h2>

                {service.statusKey && (
  <span
    className={`statusDot ${
      serviceStatus === null
        ? "checking"
        : serviceStatus[service.statusKey] === true
        ? "online"
        : "offline"
    }`}
    title={
      serviceStatus === null
        ? "Checking..."
        : serviceStatus[service.statusKey] === true
        ? "Online"
        : "Offline"
    }
  />
)}
              </div>

              <p>{service.description}</p>
            </div>

            <span className="openIcon">↗</span>
          </a>
        ))}
      </section>

      {servicesCheckedAt && (
        <p className="nodeCheckedAt">
          Services checked: {new Date(servicesCheckedAt).toLocaleTimeString()}
        </p>
      )}

      <h2>NETWORK NODES</h2>
      <section className="nodeGrid">
        {networkNodes.map((node) => {
          const online = nodeStatus?.[node.key];
          const metrics = nodeMetrics[node.key];
          const status =
            online === undefined
              ? "Checking..."
              : online
                ? "Online"
                : "Offline";
          const statusClass =
            online === undefined
              ? "checking"
              : online
                ? "online"
                : "offline";
          const alertLevel = metrics
            ? getNodeAlert(metrics)
            : "normal";

          return (
            <div
              key={node.key}
              className={`nodeCard ${alertLevel}`}
            >
              <h3>{node.name}</h3>

              <p className="nodeStatus">
                <span
                  className={`statusDot ${statusClass}`}
                  aria-hidden="true"
                />
                {status}
              </p>

              <p className="nodeAddress">{node.address}</p>

              {metrics && (
                <dl className="nodeMetrics">
                  <div>
                    <dt>Temperature</dt>
                    <dd
                      className={getTemperatureAlert(
                        metrics.temperature
                      )}
                    >
                      {metrics.temperature !== null
                        ? `${metrics.temperature} °C`
                        : "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt>Memory</dt>
                    <dd>{metrics.memoryPercent}%</dd>
                  </div>
                  <div>
                    <dt>Storage</dt>
                    <dd
                      className={getStorageAlert(
                        metrics.storagePercent
                      )}
                    >
                      {metrics.storagePercent}%
                    </dd>
                  </div>
                  <div>
                    <dt>Load</dt>
                    <dd
                      className={getLoadAlert(
                        metrics.load,
                        metrics.cpuCount
                      )}
                    >
                      {metrics.load}
                      <small>Polls every 15s</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Uptime</dt>
                    <dd>{metrics.uptime}</dd>
                  </div>
                </dl>
              )}

              {online === true && !metrics && (
                <p className="nodeMetricsUnavailable">
                  Telemetry unavailable
                </p>
              )}
            </div>
          );
        })}
      </section>

      {nodesCheckedAt && (
        <p className="nodeCheckedAt">
          Last checked: {new Date(nodesCheckedAt).toLocaleTimeString()}
        </p>
      )}

      <h2>MINING STATUS</h2>
      <section className="miningGrid">
        <div className="miningCard">
          <h3>Monero Node</h3>
          <p className="miningStatus">
            <span
              className={`statusDot ${
                miningStatus?.monero.rpcAvailable
                  ? miningStatus.monero.rpcStale ||
                    syncTrend.stalled
                    ? "warning"
                    : "online"
                  : miningStatus
                    ? "offline"
                    : "checking"
              }`}
              aria-hidden="true"
            />
            {miningStatus?.monero.rpcAvailable
              ? miningStatus.monero.rpcStale
                ? "Sync data delayed"
                : miningStatus.monero.synchronized
                ? "Synchronized"
                : syncTrend.stalled
                  ? "Sync stalled"
                  : "Synchronizing"
              : miningStatus
                ? miningStatus.monero.serviceStatus === "activating"
                  ? "Restarting"
                  : "Offline"
                : "Checking..."}
          </p>
          <dl className="miningDetails">
            <div>
              <dt>Height</dt>
              <dd>
                {miningStatus?.monero.height?.toLocaleString() ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>
                {miningStatus?.monero.targetHeight?.toLocaleString() ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Peers</dt>
              <dd>{miningStatus?.monero.peers ?? "—"}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>
                {miningStatus?.monero.syncPercent !== null &&
                miningStatus?.monero.syncPercent !== undefined
                  ? `${miningStatus.monero.syncPercent}%`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Sync speed</dt>
              <dd>
                {syncTrend.blocksPerMinute !== null
                  ? `${syncTrend.blocksPerMinute.toLocaleString()} blocks/min`
                  : "Calculating..."}
              </dd>
            </div>
            <div>
              <dt>Estimated time</dt>
              <dd>{syncTrend.eta ?? "Calculating..."}</dd>
            </div>
          </dl>
        </div>

        <div className="miningCard">
          <h3>P2Pool</h3>
          <p className="miningStatus">
            <span
              className={`statusDot ${
                miningStatus?.p2pool.running
                  ? "online"
                  : miningStatus
                    ? "offline"
                    : "checking"
              }`}
              aria-hidden="true"
            />
            {miningStatus
              ? miningStatus.p2pool.running
                ? "Running"
                : "Not running"
              : "Checking..."}
          </p>
          <dl className="miningDetails">
            <div>
              <dt>Stratum port 3333</dt>
              <dd>
                {miningStatus
                  ? miningStatus.p2pool.stratumReady
                    ? "Ready"
                    : "Closed"
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {xmrigHosts.map((host) => {
          const miner = miningStatus?.xmrig[host.key];

          return (
            <div key={host.key} className="miningCard">
              <h3>XMRig · {host.label}</h3>
              <p className="miningStatus">
                <span
                  className={`statusDot ${
                    miner?.running
                      ? "online"
                      : miningStatus
                        ? "offline"
                        : "checking"
                  }`}
                  aria-hidden="true"
                />
                {miner
                  ? miner.running
                    ? "Running"
                    : "Stopped"
                  : "Checking..."}
              </p>
              <dl className="miningDetails">
                <div>
                  <dt>CPU</dt>
                  <dd>
                    {miner ? (
                      <>
                        {miner.cpuPercent}%
                        <small>
                          {(miner.cpuPercent / 100).toFixed(2)} cores
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Memory</dt>
                  <dd>
                    {miner ? `${miner.memoryPercent}%` : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </section>

      {miningStatus && (
        <p className="nodeCheckedAt">
          Mining checked: {new Date(miningStatus.checkedAt).toLocaleTimeString()}
        </p>
      )}

      <h2>MAIN PI MONITORING</h2>
      <section className="stats">
        <div
          className={`statCard ${getTemperatureAlert(
            stats?.cpuTemp ?? null
          )}`}
        >
          <span>CPU Temperature</span>

          <strong>
            {stats?.cpuTemp !== null &&
            stats?.cpuTemp !== undefined
              ? `${stats.cpuTemp} °C`
              : "Loading..."}
          </strong>
        </div>

        <div className="statCard">
          <span>Memory</span>

          <strong>
            {stats
              ? `${stats.memory.percent}%`
              : "Loading..."}
          </strong>

          {stats && (
            <small>
              {stats.memory.usedGb} GB /{" "}
              {stats.memory.totalGb} GB
            </small>
          )}
        </div>

        <div
          className={`statCard ${getStorageAlert(
            stats?.storage?.percent ?? 0
          )}`}
        >
          <span>Storage</span>

          <strong>
            {stats?.storage
              ? `${stats.storage.percent}%`
              : "Loading..."}
          </strong>
        </div>

        <div className="statCard">
          <span>Uptime</span>

          <strong>
            {stats ? stats.uptime : "Loading..."}
          </strong>
        </div>

        <div
          className={`statCard ${
            stats
              ? getLoadAlert(
                  stats.loadAverage[0],
                  stats.cpuCount
                )
              : "normal"
          }`}
        >
          <span>CPU Load</span>

          <strong>
            {stats ? stats.loadAverage[0] : "Loading..."}
          </strong>

          {stats && (
            <small>
              {stats.cpuCount} CPU cores · Polls every 5s
            </small>
          )}
        </div>
      </section>

      {stats && (
        <p className="nodeCheckedAt">
          System checked: {new Date(stats.checkedAt).toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className="errorMessage">
          {error}
        </div>
      )}

      <footer>
        Main Raspberry Pi • Local Dashboard
      </footer>
    </main>
  );
}
