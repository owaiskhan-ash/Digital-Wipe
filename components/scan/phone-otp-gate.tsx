"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type ConfirmationResult, type RecaptchaVerifier } from "firebase/auth";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  clearPhoneVerification,
  confirmPhoneOtp,
  createPhoneRecaptchaVerifier,
  friendlyPhoneAuthError,
  getVerifiedPhoneToken,
  normalizeToE164,
  phoneAuth,
  phonesMatch,
  sendPhoneOtp,
} from "@/lib/firebase";
import { cn } from "@/lib/utils";

const COUNTRY_CODES = [
  { code: "+91", label: "IN +91" },
  { code: "+1", label: "US/CA +1" },
  { code: "+44", label: "UK +44" },
  { code: "+61", label: "AU +61" },
  { code: "+971", label: "UAE +971" },
  { code: "+65", label: "SG +65" },
  { code: "+49", label: "DE +49" },
];

export function PhoneOtpGate({
  phone,
  onPhoneChange,
  onVerifiedChange,
  disabled = false,
  compact = false,
  inputId = "phoneInput",
}: {
  phone: string;
  onPhoneChange: (nextPhone: string) => void;
  onVerifiedChange: (verified: { phoneNumber: string; token: string } | null) => void;
  disabled?: boolean;
  compact?: boolean;
  inputId?: string;
}) {
  const [countryCode, setCountryCode] = useState("+91");
  const [otpStage, setOtpStage] = useState<"idle" | "sending" | "awaiting-code" | "verifying">(
    "idle"
  );
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sentToPhone, setSentToPhone] = useState<string | null>(null);
  const [verifiedSession, setVerifiedSession] = useState<{
    phoneNumber: string;
    token: string;
  } | null>(null);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const onVerifiedChangeRef = useRef(onVerifiedChange);
  onVerifiedChangeRef.current = onVerifiedChange;

  // Sync with Firebase's isolated Phone Auth session (persists across /scan and /dashboard)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(phoneAuth, async (phoneUser) => {
      if (phoneUser?.phoneNumber) {
        const { phoneNumber, token } = await getVerifiedPhoneToken();
        if (phoneNumber && token) {
          setVerifiedSession({ phoneNumber, token });
          return;
        }
      }
      setVerifiedSession(null);
    });
    return () => unsubscribe();
  }, []);

  // Clean up RecaptchaVerifier when component unmounts
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const e164Target = normalizeToE164(phone, countryCode);
  const isCurrentNumberVerified = Boolean(
    verifiedSession &&
      e164Target &&
      phonesMatch(verifiedSession.phoneNumber, e164Target)
  );

  const verifiedPhoneValue = isCurrentNumberVerified ? verifiedSession?.phoneNumber ?? null : null;
  const verifiedTokenValue = isCurrentNumberVerified ? verifiedSession?.token ?? null : null;

  // Notify parent whenever matching verified state changes (primitive deps only)
  useEffect(() => {
    if (verifiedPhoneValue && verifiedTokenValue) {
      onVerifiedChangeRef.current({
        phoneNumber: verifiedPhoneValue,
        token: verifiedTokenValue,
      });
    } else {
      onVerifiedChangeRef.current(null);
    }
  }, [verifiedPhoneValue, verifiedTokenValue]);

  const cleanupRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // ignore
      }
      recaptchaVerifierRef.current = null;
    }
    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = "";
    }
  };

  const handleSendOtp = async () => {
    const formatted = normalizeToE164(phone, countryCode);
    if (!formatted) {
      setOtpError("Enter a valid phone number first (e.g., 9819708112 or +91 9819708112).");
      return;
    }
    if (!recaptchaContainerRef.current) {
      setOtpError("Verification widget could not initialize. Please reload the page.");
      return;
    }

    setOtpError(null);
    setOtpStage("sending");
    cleanupRecaptcha();

    try {
      const verifier = createPhoneRecaptchaVerifier(recaptchaContainerRef.current);
      recaptchaVerifierRef.current = verifier;
      const confirmation = await sendPhoneOtp(formatted, verifier);
      confirmationRef.current = confirmation;
      setSentToPhone(formatted);
      setOtpCode("");
      setOtpStage("awaiting-code");
    } catch (err) {
      cleanupRecaptcha();
      setOtpStage("idle");
      setOtpError(friendlyPhoneAuthError(err));
    }
  };

  const handleConfirmOtp = async () => {
    if (!confirmationRef.current) {
      setOtpError("OTP session expired. Request a new code.");
      setOtpStage("idle");
      return;
    }
    const cleanOtp = otpCode.replace(/\D/g, "");
    if (cleanOtp.length < 6) {
      setOtpError("Enter the 6-digit OTP code sent to your phone.");
      return;
    }

    setOtpError(null);
    setOtpStage("verifying");

    try {
      const result = await confirmPhoneOtp(confirmationRef.current, cleanOtp);
      setVerifiedSession(result);
      onVerifiedChange(result);
      setOtpStage("idle");
      setOtpCode("");
      confirmationRef.current = null;
      cleanupRecaptcha();
    } catch (err) {
      setOtpStage("awaiting-code");
      setOtpError(friendlyPhoneAuthError(err));
    }
  };

  const handleReset = async () => {
    cleanupRecaptcha();
    confirmationRef.current = null;
    setSentToPhone(null);
    setOtpCode("");
    setOtpError(null);
    setOtpStage("idle");
    await clearPhoneVerification();
    setVerifiedSession(null);
    onVerifiedChange(null);
  };

  const busy = disabled || otpStage === "sending" || otpStage === "verifying";
  const showExplicitCountrySelect = !phone.trim().startsWith("+");

  return (
    <div className="space-y-3">
      {/* Hidden mount node for Firebase invisible RecaptchaVerifier */}
      <div ref={recaptchaContainerRef} className="sr-only" aria-hidden="true" />

      <div className="flex flex-col gap-2 sm:flex-row">
        {showExplicitCountrySelect && (
          <select
            aria-label="Country calling code"
            value={countryCode}
            onChange={(e) => {
              setCountryCode(e.target.value);
              setOtpError(null);
              if (otpStage === "awaiting-code") setOtpStage("idle");
            }}
            disabled={busy || otpStage === "awaiting-code"}
            className={cn(
              "field shrink-0 bg-surface font-mono sm:w-32",
              compact ? "text-xs py-2.5" : "text-sm py-3.5"
            )}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        )}

        <div className="relative flex-1">
          <Phone
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-moss"
            strokeWidth={1.8}
          />
          <input
            id={inputId}
            type="tel"
            className={cn(
              "field w-full bg-surface pl-10 font-mono",
              compact ? "text-sm py-2.5" : "text-base py-3.5"
            )}
            value={phone}
            onChange={(event) => {
              onPhoneChange(event.target.value);
              setOtpError(null);
              if (otpStage === "awaiting-code") {
                setOtpStage("idle");
                confirmationRef.current = null;
              }
            }}
            placeholder="9819708112 or +91 9819708112"
            autoComplete="tel"
            inputMode="tel"
            disabled={busy}
            required
          />
        </div>

        {!isCurrentNumberVerified && otpStage !== "awaiting-code" && otpStage !== "verifying" && (
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={busy || !e164Target}
            className={cn(
              "btn btn-secondary shrink-0 whitespace-nowrap border-moss/40 text-moss-deep hover:bg-moss-soft",
              compact ? "btn-sm" : ""
            )}
          >
            {otpStage === "sending" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Sending OTP…
              </>
            ) : (
              <>
                <KeyRound className="size-3.5" aria-hidden />
                Send SMS OTP
              </>
            )}
          </button>
        )}
      </div>

      {/* Verified State Banner */}
      {isCurrentNumberVerified && verifiedSession ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-moss/35 bg-moss-soft/80 px-3.5 py-2.5 text-xs text-moss-deep">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-moss" strokeWidth={2.1} aria-hidden />
            <span>
              Number verified via SMS OTP:{" "}
              <strong className="font-mono">{verifiedSession.phoneNumber}</strong>
            </span>
          </span>
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="text-[0.75rem] font-medium text-moss-deep underline underline-offset-2 hover:text-ink disabled:opacity-40"
          >
            Change / Re-verify
          </button>
        </div>
      ) : otpStage === "awaiting-code" || otpStage === "verifying" ? (
        /* 6-Digit OTP Entry Panel */
        <div className="rounded-xl border border-moss/30 bg-surface p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
              <ShieldCheck className="size-3.5 text-moss" aria-hidden />
              Enter the 6-digit SMS code sent to{" "}
              <span className="font-mono text-moss-deep">{sentToPhone || e164Target}</span>
            </p>
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[0.72rem] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40"
            >
              <RefreshCw className="size-3" aria-hidden />
              Resend code
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(e) => {
                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setOtpError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleConfirmOtp();
                }
              }}
              placeholder="6-digit OTP"
              className="field flex-1 bg-mist/40 font-mono text-base tracking-[0.25em]"
              disabled={otpStage === "verifying"}
            />
            <button
              type="button"
              onClick={handleConfirmOtp}
              disabled={otpStage === "verifying" || otpCode.length < 6}
              className="btn btn-primary shrink-0"
            >
              {otpStage === "verifying" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Verifying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Verify OTP
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-[0.74rem] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-moss" aria-hidden />
          <span>
            Ownership check required: verify this number with a quick Firebase SMS OTP before
            searching Google for it.
          </span>
        </p>
      )}

      {otpError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay-soft px-3.5 py-2.5 text-xs text-clay"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{otpError}</span>
        </div>
      )}
    </div>
  );
}
