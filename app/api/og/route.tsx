import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SITE_DOMAIN } from "@/lib/site";

export const runtime = "nodejs";
const SIZE = { width: 1200, height: 630 };

const INK = "#1C1E1A";
const MUTED = "#6A6F65";
const INK_SOFT = "#464B43";
const LINE = "#E6E4DB";
const MOSS = "#4C7561";
const SAND = "#E9E1D2";
const GREY = "#CDC8BA";

async function loadFont(file: string, origin: string): Promise<ArrayBuffer> {
  // The woff files are traced into the function (see next.config.ts), so
  // reading them locally is the reliable path. The origin fetch is a fallback.
  try {
    const buffer = await readFile(path.join(process.cwd(), "public", "fonts", file));
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  } catch {
    /* fall through to the network */
  }
  const response = await fetch(new URL(`/fonts/${file}`, origin));
  if (!response.ok) throw new Error(`Could not load font ${file}`);
  return await response.arrayBuffer();
}

async function loadMark(): Promise<string> {
  const buffer = await readFile(
    path.join(process.cwd(), "public", "brand", "logo.png"),
  );
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const [serif, sans, sansMedium, mark] = await Promise.all([
    loadFont("instrument-serif-400.woff", origin),
    loadFont("inter-400.woff", origin),
    loadFont("inter-500.woff", origin),
    loadMark(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#FAFAF7",
          fontFamily: "Inter",
          color: INK,
        }}
      >
        {/* Soft geometry, flat shapes only */}
        <div
          style={{
            position: "absolute",
            top: 84,
            right: 84,
            width: 250,
            height: 190,
            display: "flex",
          }}
        >
          <div style={{ position: "absolute", top: 0, right: 0, width: 96, height: 96, borderRadius: 22, backgroundColor: SAND }} />
          <div style={{ position: "absolute", top: 92, right: 74, width: 74, height: 74, borderRadius: 18, backgroundColor: MOSS }} />
          <div style={{ position: "absolute", top: 40, right: 116, width: 48, height: 48, borderRadius: 12, backgroundColor: GREY }} />
          <div style={{ position: "absolute", top: 128, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: GREY }} />
          <div style={{ position: "absolute", top: 154, right: 34, width: 12, height: 12, borderRadius: 6, backgroundColor: MOSS }} />
          <div style={{ position: "absolute", top: 168, right: 62, width: 8, height: 8, borderRadius: 4, backgroundColor: SAND }} />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "72px 80px 60px",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={mark} width={66} height={66} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: "Instrument Serif", fontSize: 42, lineHeight: 1, color: INK }}>
                untrace
              </div>
              <div style={{ fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, marginTop: 7 }}>
                AI-POWERED PERSONAL DATA REMOVAL
              </div>
            </div>
          </div>

          {/* Headline */}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
            <div style={{ fontFamily: "Instrument Serif", fontSize: 76, lineHeight: 1.05, letterSpacing: "-0.02em", color: INK }}>
              Hundreds of sites sell
            </div>
            <div style={{ fontFamily: "Instrument Serif", fontSize: 76, lineHeight: 1.05, letterSpacing: "-0.02em", color: INK }}>
              your personal data
            </div>
            <div style={{ fontFamily: "Instrument Serif", fontSize: 76, lineHeight: 1.05, letterSpacing: "-0.02em", color: MUTED }}>
              to anyone who asks.
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `1px solid ${LINE}`,
              paddingTop: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: MOSS }} />
              <div style={{ fontSize: 23, fontWeight: 500, color: INK_SOFT }}>{SITE_DOMAIN}</div>
            </div>
            <div style={{ fontSize: 21, color: MUTED }}>
              4 AI agents. One deletion request each.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: "Instrument Serif", data: serif, style: "normal", weight: 400 },
        { name: "Inter", data: sans, style: "normal", weight: 400 },
        { name: "Inter", data: sansMedium, style: "normal", weight: 500 },
      ],
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}
