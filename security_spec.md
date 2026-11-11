# Security Specification: Untrace Firestore Rules

## 1. Data Invariants
1. **User Identity Boundary**: A user can only read, create, and update their own document at `/users/{userId}` where `request.auth.uid == userId`.
2. **Scan Ownership Invariant**: A scan record at `/users/{userId}/scans/{scanId}` must have `incoming().userId == request.auth.uid == userId`. Scans are immutable once written; updates are prohibited.
3. **Removal Request Ownership Invariant**: A removal request at `/users/{userId}/requests/{requestId}` must belong to the authenticated owner (`incoming().userId == request.auth.uid == userId`).
4. **Verified Auth Guarantee**: Writes require an authenticated session (`request.auth != null`) and an email verified token (`request.auth.token.email_verified == true`).
5. **No Cross-User Access (PII Isolation)**: No user can read, list, query, or mutate another user's personal details, scan history, or removal correspondence.
6. **Default Deny Catch-All**: All unlisted collections and operations return PERMISSION_DENIED by default.

## 2. The "Dirty Dozen" Attack Payloads (Designed to Fail)
1. **Unauthenticated Read**: Anonymous user reading `/users/alice123`.
2. **Cross-User Profile Hijack**: Bob (`uid: bob456`) trying to read `/users/alice123`.
3. **Ghost Role Injection**: Alice attempting to write `{ "isAdmin": true, "role": "admin" }` to `/users/alice123`.
4. **Oversized String Bomb**: Alice submitting `displayName` with 5,000 characters.
5. **Path Variable ID Poisoning**: Attacker submitting document path `/users/../admin_secrets/123`.
6. **Scan Impersonation**: Bob creating a scan document under `/users/alice123/scans/scan_1` with `userId: alice123`.
7. **Cross-Tenant Scan Reading**: Bob attempting `list` or `get` on `/users/alice123/scans`.
8. **Scan Mutation Tamper**: Alice attempting an update to mutate past scan data (`allow update` denied on scans).
9. **Unverified Email Mutation**: Attacker with unverified email attempting to write to `/users/{userId}/requests/{requestId}`.
10. **Shadow Request Field**: Alice updating a request with extra unauthorized ghost properties.
11. **Forged Owner Mutation**: Bob attempting to update a request under Alice's collection.
12. **Blanket Query Scraping**: Malicious client running an open collection group or unrestricted list query across all users.

## 3. Security Rule Assertions
All 12 payloads must result in `PERMISSION_DENIED` at the Firestore security rules engine layer.
