import type { BreachExposure } from "./types";

/**
 * Real, publicly documented breaches used to model credential exposure.
 * Nothing here identifies a person — the scan picks a plausible subset.
 */
export const BREACH_CATALOG: Omit<BreachExposure, "id" | "risk">[] = [
  {
    name: "LinkedIn",
    year: 2021,
    accounts: "700 million",
    exposed: ["email", "employer", "jobTitle", "credentials"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Reset your LinkedIn password, turn on 2FA and revoke old sessions.",
  },
  {
    name: "Adobe",
    year: 2013,
    accounts: "153 million",
    exposed: ["email", "passwordHash", "credentials"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "If you reused that password anywhere, change it there first.",
  },
  {
    name: "Canva",
    year: 2019,
    accounts: "137 million",
    exposed: ["email", "fullName", "credentials"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Rotate the password and check for password-manager coverage.",
  },
  {
    name: "Dropbox",
    year: 2012,
    accounts: "68 million",
    exposed: ["email", "passwordHash"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Old hashes still get cracked. Confirm Dropbox 2FA is on.",
  },
  {
    name: "MyFitnessPal",
    year: 2018,
    accounts: "143 million",
    exposed: ["email", "usernames", "passwordHash"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Health-adjacent data — avoid reusing this identity anywhere.",
  },
  {
    name: "Facebook",
    year: 2019,
    accounts: "533 million",
    exposed: ["fullName", "phone", "email", "city"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "This data still powers scam calls. Change the phone number on the account.",
  },
  {
    name: "Collection #1",
    year: 2019,
    accounts: "773 million",
    exposed: ["email", "credentials", "passwordHash"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "A credential-stuffing list. Enable 2FA everywhere it matters.",
  },
  {
    name: "Twitter / X",
    year: 2022,
    accounts: "200 million",
    exposed: ["email", "phone", "usernames"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Watch for targeted phishing that quotes your handle.",
  },
  {
    name: "Chegg",
    year: 2018,
    accounts: "40 million",
    exposed: ["email", "fullName", "homeAddress"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Address exposure — expect postal marketing to follow.",
  },
  {
    name: "Wattpad",
    year: 2020,
    accounts: "270 million",
    exposed: ["email", "usernames", "passwordHash"],
    checkUrl: "https://haveibeenpwned.com/",
    advice: "Reset and check whether the handle is reused elsewhere.",
  },
];


export const BREACH_COUNT = BREACH_CATALOG.length;
