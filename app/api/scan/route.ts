import { NextResponse } from "next/server";
import { runScan, type RawProfileInput } from "@/lib/scan";

export const runtime = "nodejs";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let payload: RawProfileInput;

  try {
    payload = (await request.json()) as RawProfileInput;
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const fullName = clean(payload.fullName);
  const city = clean(payload.city);

  if (fullName.length < 2) {
    return NextResponse.json({ error: "A full name is required." }, { status: 422 });
  }
  if (city.length < 2) {
    return NextResponse.json(
      { error: "A city is required — nearly every listing is keyed to a place." },
      { status: 422 },
    );
  }

  /**
   * The scan itself is stateless: is input in, report out, nothing persisted.
   * Swap `runScan` for a live provider here and the rest of the app is unchanged.
   */
  const scan = runScan({
    ...payload,
    fullName: fullName.slice(0, 120),
    city: city.slice(0, 80),
  });

  return NextResponse.json({ scan });
}
