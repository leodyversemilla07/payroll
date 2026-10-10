"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const loginEmailDraftKey = "payroll:login-email-draft";

function saveEmailDraft(email: string) {
  try {
    if (email) {
      sessionStorage.setItem(loginEmailDraftKey, email);
    } else {
      sessionStorage.removeItem(loginEmailDraftKey);
    }
  } catch {
    // Storage can be blocked; the form still works without draft recovery.
  }
}

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [emailDraft, setEmailDraft] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"CREDENTIALS" | "MFA">("CREDENTIALS");
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // A background session recheck resets a never-successful query to
  // pending, which must not unmount the sign-in form and discard what the
  // user already typed. Gate only the initial check, then keep the form
  // mounted across refetches.
  const [sessionChecked, setSessionChecked] = useState(false);
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const sessionSettled = me.isSuccess || (me.isError && !me.isFetching);
  const apiUnreachable = me.isError && me.error?.data?.code !== "UNAUTHORIZED";
  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data && "requiresMfa" in data && data.requiresMfa) {
        setMfaTicket(data.mfaTicket);
        setStep("MFA");
        return;
      }
      queryClient.clear();
      saveEmailDraft("");
      setEmailDraft("");
      await router.push("/dashboard");
    },
  });

  const verifyMfa = trpc.auth.verifyMfa.useMutation({
    onSuccess: async () => {
      queryClient.clear();
      saveEmailDraft("");
      setEmailDraft("");
      await router.push("/dashboard");
    },
  });

  useEffect(() => {
    try {
      setEmailDraft(sessionStorage.getItem(loginEmailDraftKey) ?? "");
    } catch {
      // Storage can be blocked; the form still works without draft recovery.
    }
  }, []);

  useEffect(() => {
    if (sessionSettled) {
      setSessionChecked(true);
    }
  }, [sessionSettled]);

  useEffect(() => {
    // An expired session may leave previous data in React Query alongside
    // its UNAUTHORIZED error. Cached identity alone must not redirect back
    // into the workspace and create a sign-in/workspace navigation loop.
    if (me.isSuccess && me.data) {
      void router.replace("/dashboard");
    }
  }, [me.data, me.isSuccess, router]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await login
      .mutateAsync({
        email: String(data.get("email")),
        password: String(data.get("password")),
      })
      .catch(() => {
        /* Error is displayed below; never expose credentials. */
      });
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaTicket) return;
    await verifyMfa
      .mutateAsync({
        mfaTicket,
        code: mfaCode.trim(),
      })
      .catch(() => {
        /* Error is displayed below */
      });
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <Card className="animate-in fade-in duration-300">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Loader2 className="size-4.5 animate-spin" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">
                    Payroll
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Sign in to your account
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2 pt-2">
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div
                role="status"
                className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground"
              >
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span>Checking your session…</span>
              </div>
            </CardContent>
          </Card>
          <p
            role="note"
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            Not validated for live payroll. Regulatory, annual-tax/BIR 2316 and
            bank-file checks remain outstanding.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          {apiUnreachable && (
            <p role="alert">
              Could not reach the payroll API. Check that it is running, then{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void me.refetch()}
              >
                Retry
              </Button>
            </p>
          )}
          {step === "MFA" ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h1>Two-Factor Authentication</h1>
                </CardTitle>
                <CardDescription>
                  Enter the 6-digit code from your authenticator app, or an
                  8-character backup code.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitMfa}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="mfaCode">Security Code</FieldLabel>
                      <Input
                        id="mfaCode"
                        name="mfaCode"
                        type="text"
                        placeholder="123456"
                        autoComplete="one-time-code"
                        value={mfaCode}
                        onChange={(event) =>
                          setMfaCode(event.currentTarget.value)
                        }
                        autoFocus
                        required
                      />
                    </Field>
                    {verifyMfa.isError && (
                      <FieldError>
                        {verifyMfa.error.message ||
                          "Invalid verification code. Please try again."}
                      </FieldError>
                    )}
                    <Field>
                      <Button type="submit" disabled={verifyMfa.isPending}>
                        {verifyMfa.isPending
                          ? "Verifying…"
                          : "Verify and Login"}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => {
                          setStep("CREDENTIALS");
                          setMfaTicket(null);
                          setMfaCode("");
                          verifyMfa.reset();
                        }}
                      >
                        Back to Login
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h1>Login to your account</h1>
                </CardTitle>
                <CardDescription>
                  Enter your email below to login to your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={signIn}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="m@example.com"
                        autoComplete="username"
                        value={emailDraft}
                        onChange={(event) => {
                          setEmailDraft(event.currentTarget.value);
                          saveEmailDraft(event.currentTarget.value);
                        }}
                        required
                      />
                    </Field>
                    <Field>
                      <div className="flex items-center">
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                        <span
                          className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                          title="Password reset is not available"
                        >
                          Forgot your password?
                        </span>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
                          aria-label={showPassword ? "Hide" : "Show"}
                          title={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                          ) : (
                            <Eye className="size-4" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </Field>
                    {login.isError && (
                      <FieldError>
                        {login.error.data?.code === "UNAUTHORIZED"
                          ? "Invalid email or password."
                          : "Sign in failed. Please retry."}
                      </FieldError>
                    )}
                    <Field>
                      <Button type="submit" disabled={login.isPending}>
                        {login.isPending ? "Logging in…" : "Login"}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        disabled
                        title="Google sign-in is not available"
                      >
                        Login with Google
                      </Button>
                      <FieldDescription className="text-center">
                        Don&apos;t have an account?{" "}
                        <span
                          className="underline underline-offset-4"
                          title="Self-registration is not available"
                        >
                          Sign up
                        </span>
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
        <p
          role="note"
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Not validated for live payroll. Regulatory, annual-tax/BIR 2316 and
          bank-file checks remain outstanding.
        </p>
      </div>
    </main>
  );
}
