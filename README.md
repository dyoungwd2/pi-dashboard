# Pi Dashboard

A private home-network dashboard for monitoring and opening services across a small Raspberry Pi setup. It provides one browser-based view of system health, network nodes, self-hosted services, and cryptocurrency-mining processes.

The current installation monitors a main dashboard host, an Umbrel home server, and a separate Monero node. P2Pool Nano and XMRig run on the dashboard host, while monerod runs on the remote node. Network addresses and SSH users are installation-specific and can be changed in the API route configuration.

## Features

- Live CPU temperature, memory, storage, uptime, load, and processor-count metrics
- Online status and system metrics for multiple Raspberry Pi nodes
- Service launchers and availability checks for Pironman, Umbrel, Portainer, BitBoard, and mining dashboards
- Monero daemon status, synchronization progress, block height, and peer count
- Local P2Pool Nano service and Stratum-port status
- Local XMRig service status, 60-second hashrate, thread count, and resource usage
- Quick links and SSH command shortcuts for common administration tasks
- Responsive cyberpunk-style interface designed for daily LAN use

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4 tooling and custom CSS
- Server-side Node.js APIs for local system commands, TCP checks, HTTP checks, and SSH monitoring

## Requirements

- Node.js 20 or newer
- npm
- Linux on the dashboard host
- Passwordless SSH access to monitored remote nodes
- A dedicated monitoring key authorized on each remote node

Set `PI_DASHBOARD_SSH_KEY` to the monitoring private-key path used by your installation.

## Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` for optional mining-dashboard configuration:

```env
MONERO_WALLET_ADDRESS=your_monero_wallet_address
MONERO_WORKER_NAME=your_worker_name
PI_DASHBOARD_SSH_KEY=/path/to/monitoring_key
```

`MONERO_WALLET_ADDRESS` enables the OwnBlock miner link. `MONERO_WORKER_NAME` defaults to `Kira`, and `PI_DASHBOARD_SSH_KEY` may be omitted when using the default key path.

Environment files are ignored by Git and must never be committed.

## Running locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To make the dashboard available to other devices on the LAN:

```bash
npm run dev -- --hostname 0.0.0.0
```

Then open port `3000` using the dashboard Pi's hostname or IP address.

## Production build

```bash
npm run build
npm start -- --hostname 0.0.0.0
```

For continuous use, run the production server through a service manager such as systemd so it starts automatically after boot.

## Customizing the network

The current node addresses, SSH users, service URLs, and mining host are specific to this installation. Update these files when adapting the dashboard to another network:

- `app/page.tsx` — service cards, quick actions, node labels, and browser links
- `app/api/nodes/route.ts` — node addresses, ports, SSH users, and remote metrics
- `app/api/mining/route.ts` — remote monerod and local P2Pool/XMRig checks
- `app/api/services/route.ts` — service health-check URLs
- `next.config.ts` — permitted development origins

## Checks

```bash
npm run lint
npm run build
```

## Security

This dashboard is intended for a trusted private network. Its server-side routes execute local system checks and connect to other machines over SSH. Do not expose it directly to the public internet without adding authentication, authorization, network restrictions, and appropriate hardening.

Keep private keys and `.env.local` outside version control. The repository should contain configuration references only, never credentials.
