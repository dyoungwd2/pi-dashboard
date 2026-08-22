import { NextResponse } from "next/server";

const services = [
  {
    key: "umbrel",
    url: "http://umbrel.local",
  },
  {
    key: "pironman",
    url: "http://127.0.0.1:34001",
  },
  {
    key: "portainer",
    url: "http://umbrel.local:9000",
  },
  {
    key: "bitboard",
    url: "http://umbrel.local:3711",
  },
];

async function checkService(url: string) {
  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 2500);

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const results = await Promise.all(
    services.map(async (service) => ({
      key: service.key,
      online: await checkService(service.url),
    }))
  );

  return NextResponse.json({
    statuses: Object.fromEntries(
      results.map((item) => [item.key, item.online])
    ),
    checkedAt: new Date().toISOString(),
  });
}
