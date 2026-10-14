"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function MfaSettingsCard() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const isMfaEnabled = Boolean(me.data?.mfaEnabled);

  // Setup state
  const [setupState, setSetupState] = useState<
    "IDLE" | "SETUP" | "BACKUP_CODES"
  >("IDLE");
  const [secret, setSecret] = useState("");
  const [qrUri, setQrUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Disable state
  const [disableState, setDisableState] = useState<"IDLE" | "CONFIRM">("IDLE");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  // Regenerate backup codes state
  const [regenerateState, setRegenerateState] = useState<"IDLE" | "CONFIRM">(
    "IDLE",
  );
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [showRegeneratePassword, setShowRegeneratePassword] = useState(false);

  // Mutations
  const setupMfa = trpc.auth.setupMfa.useMutation({
    onSuccess: (data) => {
      setSecret(data.secret);
      setQrUri(data.qrUri);
      setQrDataUrl((data as { qrDataUrl?: string }).qrDataUrl ?? "");
      setSetupState("SETUP");
      setVerificationCode("");
    },
  });

  const confirmMfa = trpc.auth.confirmMfa.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetupState("BACKUP_CODES");
      void utils.auth.me.invalidate();
    },
  });

  const regenerateBackupCodes = trpc.auth.regenerateBackupCodes.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetupState("BACKUP_CODES");
      setRegenerateState("IDLE");
      setRegeneratePassword("");
      void utils.auth.me.invalidate();
    },
  });

  const disableMfa = trpc.auth.disableMfa.useMutation({
    onSuccess: () => {
      setDisableState("IDLE");
      setDisablePassword("");
      setDisableCode("");
      void utils.auth.me.invalidate();
    },
  });

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Fallback if clipboard API blocked
    }
  };

  const handleCopyBackupCodes = async () => {
    if (backupCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopiedBackup(true);
      setTimeout(() => setCopiedBackup(false), 2000);
    } catch {
      // Fallback if clipboard API blocked
    }
  };

  const handleStartSetup = async () => {
    setupMfa.reset();
    confirmMfa.reset();
    await setupMfa.mutateAsync().catch(() => {});
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) return;
    await confirmMfa
      .mutateAsync({ code: verificationCode.trim() })
      .catch(() => {});
  };

  const handleDisableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableCode.trim()) return;
    await disableMfa
      .mutateAsync({
        password: disablePassword,
        code: disableCode.trim(),
      })
      .catch(() => {});
  };

  const handleRegenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regeneratePassword) return;
    await regenerateBackupCodes
      .mutateAsync({
        password: regeneratePassword,
      })
      .catch(() => {});
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            {isMfaEnabled ? (
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
            )}
            <CardTitle>
              <h3>Two-Factor Authentication (TOTP)</h3>
            </CardTitle>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isMfaEnabled
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {isMfaEnabled ? "Active & Enforced" : "Disabled"}
          </span>
        </div>
        <CardDescription>
          {isMfaEnabled
            ? "Your account is secured with time-based one-time password verification on every sign-in."
            : "Add an extra layer of protection by requiring a 6-digit code from an authenticator app when signing in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Backup Codes View after Confirmation */}
        {setupState === "BACKUP_CODES" ? (
          <div className="space-y-4 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-5">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="size-5" />
              <h4 className="text-sm font-semibold">
                Two-Factor Authentication is Enabled!
              </h4>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Save these backup recovery codes immediately.</strong> If
              you lose access to your authenticator app, each code can be used
              once as your security code when signing in.
            </p>

            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 font-mono text-xs text-foreground sm:grid-cols-2">
              {backupCodes.map((code) => (
                <div
                  key={code}
                  className="rounded bg-muted/40 p-1.5 text-center font-bold tracking-wider"
                >
                  {code}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyBackupCodes}
              >
                {copiedBackup ? (
                  <>
                    <Check className="size-4 mr-1 text-emerald-600" />
                    Codes Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-1" />
                    Copy All Backup Codes
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setSetupState("IDLE");
                  setBackupCodes([]);
                }}
              >
                I Have Saved My Backup Codes
              </Button>
            </div>
          </div>
        ) : !isMfaEnabled ? (
          <>
            {setupState === "IDLE" && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Protect Your Account</p>
                  <p className="text-xs text-muted-foreground">
                    Compatible with Google Authenticator, Microsoft
                    Authenticator, 1Password, and other RFC 6238 apps.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleStartSetup}
                  disabled={setupMfa.isPending}
                >
                  {setupMfa.isPending ? "Generating Key…" : "Set Up 2FA"}
                </Button>
              </div>
            )}

            {setupState === "SETUP" && (
              <form
                onSubmit={handleConfirmSubmit}
                className="space-y-5 rounded-lg border bg-muted/10 p-5"
              >
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <KeyRound className="size-4" />
                    Step 1: Add to Your Authenticator App
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Scan this QR code with Google Authenticator, 1Password,
                    Microsoft Authenticator, or enter the manual key below.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 rounded-lg border bg-card p-4">
                    {qrDataUrl && (
                      <div className="rounded-xl border bg-white p-2.5 shadow-xs shrink-0 dark:border-border">
                        {/* biome-ignore lint/performance/noImgElement: Data URI QR code does not use remote optimization */}
                        <img
                          src={qrDataUrl}
                          alt="Two-factor authentication QR code"
                          width={160}
                          height={160}
                          className="rounded block"
                        />
                      </div>
                    )}
                    <div className="space-y-3 flex-1 min-w-0 w-full">
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <QrCode className="size-3.5" />
                          Manual Secret Key:
                        </span>
                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 font-mono text-xs tracking-wider">
                          <span className="flex-1 break-all select-all font-semibold text-foreground">
                            {secret}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCopySecret}
                            className="shrink-0 text-xs h-7 px-2"
                          >
                            {copiedSecret ? (
                              <>
                                <Check className="size-3 mr-1 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="size-3 mr-1" />
                                Copy Key
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {qrUri && (
                        <div>
                          <a
                            href={qrUri}
                            className="inline-flex items-center text-xs text-primary hover:underline gap-1 font-medium"
                          >
                            <ExternalLink className="size-3" />
                            Open directly in Authenticator application
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    Step 2: Enter Verification Code
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code currently generated by your
                    authenticator app to confirm setup.
                  </p>
                  <Field>
                    <FieldLabel htmlFor="confirmMfaCode">
                      6-Digit Security Code
                    </FieldLabel>
                    <Input
                      id="confirmMfaCode"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="max-w-xs font-mono tracking-widest text-center text-lg"
                      autoFocus
                      required
                    />
                    {confirmMfa.isError && (
                      <FieldError>
                        {confirmMfa.error.message ||
                          "Invalid verification code. Please check your authenticator and try again."}
                      </FieldError>
                    )}
                  </Field>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={
                      confirmMfa.isPending || verificationCode.trim().length < 6
                    }
                  >
                    {confirmMfa.isPending
                      ? "Verifying…"
                      : "Verify and Activate"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSetupState("IDLE");
                      setSecret("");
                      setQrUri("");
                      setVerificationCode("");
                      confirmMfa.reset();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {/* Authenticator App Status */}
            {disableState === "IDLE" && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      Authenticator App (RFC 6238)
                    </p>
                    <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Google Authenticator / 1Password verification is required on
                    every sign-in.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDisableState("CONFIRM");
                    setDisablePassword("");
                    setDisableCode("");
                    setRegenerateState("IDLE");
                    disableMfa.reset();
                  }}
                >
                  Disable 2FA
                </Button>
              </div>
            )}

            {disableState === "CONFIRM" && (
              <form
                onSubmit={handleDisableSubmit}
                className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5"
              >
                <div>
                  <h4 className="text-sm font-semibold text-destructive">
                    Confirm Disabling Two-Factor Authentication
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Enter your account password and a current authenticator code
                    or backup code to confirm.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="disablePassword">
                      Current Password
                    </FieldLabel>
                    <div className="relative">
                      <Input
                        id="disablePassword"
                        type={showDisablePassword ? "text" : "password"}
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowDisablePassword((prev) => !prev)}
                        className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
                        aria-label={showDisablePassword ? "Hide" : "Show"}
                        title={
                          showDisablePassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        {showDisablePassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="disableCode">
                      Authenticator or Backup Code
                    </FieldLabel>
                    <Input
                      id="disableCode"
                      type="text"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value)}
                      placeholder="123456 or a1b2c3d4"
                      required
                    />
                  </Field>
                </div>

                {disableMfa.isError && (
                  <FieldError>
                    {disableMfa.error.message ||
                      "Verification failed. Please check your credentials."}
                  </FieldError>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={
                      disableMfa.isPending ||
                      !disablePassword ||
                      !disableCode.trim()
                    }
                  >
                    {disableMfa.isPending ? "Disabling…" : "Confirm Disable"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDisableState("IDLE");
                      disableMfa.reset();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {/* Emergency Backup Codes Section */}
            {disableState === "IDLE" && (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        Emergency Backup Codes
                      </p>
                      <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                        {(me.data as { mfaBackupCodesCount?: number })
                          ?.mfaBackupCodesCount ?? 0}{" "}
                        codes remaining
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One-time use recovery codes if you lose access to your
                      authenticator app.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRegenerateState(
                        regenerateState === "CONFIRM" ? "IDLE" : "CONFIRM",
                      );
                      setRegeneratePassword("");
                      regenerateBackupCodes.reset();
                    }}
                  >
                    <RefreshCw className="size-3.5 mr-1.5" />
                    Regenerate Codes
                  </Button>
                </div>

                {regenerateState === "CONFIRM" && (
                  <form
                    onSubmit={handleRegenerateSubmit}
                    className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        Regenerate Backup Recovery Codes
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Generating new recovery codes will immediately
                        invalidate any previous unused backup codes. Enter your
                        password to confirm.
                      </p>
                    </div>

                    <div className="max-w-xs">
                      <Field>
                        <FieldLabel htmlFor="regeneratePassword">
                          Account Password
                        </FieldLabel>
                        <div className="relative">
                          <Input
                            id="regeneratePassword"
                            type={showRegeneratePassword ? "text" : "password"}
                            value={regeneratePassword}
                            onChange={(e) =>
                              setRegeneratePassword(e.target.value)
                            }
                            placeholder="••••••••••••"
                            required
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setShowRegeneratePassword((prev) => !prev)
                            }
                            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
                            aria-label={
                              showRegeneratePassword ? "Hide" : "Show"
                            }
                            title={
                              showRegeneratePassword
                                ? "Hide password"
                                : "Show password"
                            }
                          >
                            {showRegeneratePassword ? (
                              <EyeOff className="size-4" aria-hidden="true" />
                            ) : (
                              <Eye className="size-4" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      </Field>
                    </div>

                    {regenerateBackupCodes.isError && (
                      <FieldError>
                        {regenerateBackupCodes.error.message ||
                          "Could not regenerate backup codes. Verify your password."}
                      </FieldError>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="submit"
                        disabled={
                          regenerateBackupCodes.isPending || !regeneratePassword
                        }
                      >
                        {regenerateBackupCodes.isPending
                          ? "Generating…"
                          : "Generate 10 Fresh Codes"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRegenerateState("IDLE");
                          setRegeneratePassword("");
                          regenerateBackupCodes.reset();
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
