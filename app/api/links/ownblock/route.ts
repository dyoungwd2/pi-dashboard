import { NextResponse } from "next/server";

export async function GET() {
  const walletAddress = process.env.MONERO_WALLET_ADDRESS;

  if (!walletAddress) {
    return NextResponse.json(
      { error: "Mining dashboard is not configured" },
      { status: 503 }
    );
  }

  const dashboardUrl = new URL(
    `https://xmr.ownblock.io/miners/${encodeURIComponent(walletAddress)}`
  );

  dashboardUrl.searchParams.set(
    "worker",
    process.env.MONERO_WORKER_NAME ?? "Kira"
  );

  return NextResponse.redirect(dashboardUrl);
}
