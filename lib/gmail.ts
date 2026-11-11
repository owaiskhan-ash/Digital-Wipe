/**
 * Google Workspace Gmail integration for sending data removal requests.
 * Uses official Gmail REST API with least-privilege gmail.send scope.
 */

export const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

export type SendEmailParams = {
  to: string;
  from: string;
  subject: string;
  body: string;
  accessToken: string;
};

export type SendEmailResult = {
  id: string;
  threadId: string;
};

const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

function stripHeaderControlChars(value: string): string {
  return value.replace(/[\r\n\0]+/g, " ").trim();
}

function sanitizeEmailAddress(raw: string, fieldName: "To" | "From"): string {
  const cleaned = stripHeaderControlChars(raw);
  if (!cleaned || cleaned.length > 254 || !STRICT_EMAIL_REGEX.test(cleaned)) {
    throw new Error(`Invalid ${fieldName} email address.`);
  }
  return cleaned;
}

function toBase64Standard(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

function toBase64Url(str: string): string {
  return toBase64Standard(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createRawMimeEmail(params: {
  to: string;
  from: string;
  subject: string;
  body: string;
}): string {
  const safeFrom = sanitizeEmailAddress(params.from, "From");
  const safeTo = sanitizeEmailAddress(params.to, "To");
  const safeSubject = stripHeaderControlChars(params.subject).slice(0, 500);
  const encodedSubject = `=?UTF-8?B?${toBase64Standard(safeSubject)}?=`;
  const normalizedBody = params.body.replace(/\r?\n/g, "\r\n");

  const mimeLines = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizedBody,
  ];

  return toBase64Url(mimeLines.join("\r\n"));
}

export async function sendEmailViaGmail(params: SendEmailParams): Promise<SendEmailResult> {
  const raw = createRawMimeEmail(params);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.error?.message ||
      `Gmail API returned ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  return (await response.json()) as SendEmailResult;
}
