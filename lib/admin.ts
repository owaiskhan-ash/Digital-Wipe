/**
 * Who may open /admin.
 *
 * One list, three places that must agree: this file, the page that renders the
 * panel, and `firestore.rules` (the rules cannot read environment variables, so
 * the same addresses are written there by hand). Change both, or the panel will
 * load and then be refused by the database.
 *
 * Set NEXT_PUBLIC_ADMIN_EMAILS="a@x.com,b@y.com" to add or replace addresses
 * without touching code.
 */
const DEFAULT_ADMIN_EMAILS = ["ashketchupkeke@gmail.com"];

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes("@"));
}

export const ADMIN_EMAILS: string[] = (() => {
  const fromEnv = parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_EMAILS;
})();

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
