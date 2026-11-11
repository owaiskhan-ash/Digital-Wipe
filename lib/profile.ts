import type { Profile } from "./types";

/**
 * Profile input as it arrives from the scan form or a stored report.
 * Kept out of the old simulated scan module so the swarm route no longer
 * pulls a fake broker engine into its bundle.
 */
export type RawProfileInput = {
  fullName?: string;
  city?: string;
  region?: string;
  country?: string;
  emails?: string | string[];
  phones?: string | string[];
  usernames?: string | string[];
};

export function normaliseProfile(input: RawProfileInput): Profile {
  const clean = (value: unknown): string =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  const split = (value: unknown, pattern: RegExp): string[] => {
    if (Array.isArray(value)) return value.flatMap((v) => split(v, pattern));
    if (typeof value !== "string") return [];
    return value
      .split(pattern)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  return {
    fullName: clean(input.fullName),
    city: clean(input.city),
    region: clean(input.region),
    country: clean(input.country) || "United States",
    // Emails and handles never contain spaces; phone numbers usually do.
    emails: Array.from(
      new Set(split(input.emails, /[,;\s]+/).map((email) => email.toLowerCase())),
    ).slice(0, 5),
    phones: Array.from(
      new Set(
        split(input.phones, /[,;\n]+/)
          .map((phone) => phone.replace(/\s+/g, " ").trim())
          .filter((phone) => phone.replace(/\D/g, "").length >= 5),
      ),
    ).slice(0, 4),
    usernames: Array.from(
      new Set(
        split(input.usernames, /[,;\s]+/).map((handle) => handle.replace(/^@/, "").trim()),
      ),
    ).filter(Boolean).slice(0, 5),
  };
}
