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

function toBase64Url(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary)
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
  const { to, from, subject, body } = params;
  const encodedSubject = `=?UTF-8?B?${toBase64Url(subject)}?=`;

  const mimeLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
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
