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
import Link from "next/link";
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

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [emailDraft, setEmailDraft] = useState("");
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      queryClient.clear();
      saveEmailDraft("");
      setEmailDraft("");
      await router.push("/portal");
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
    if (me.data) {
      void router.replace("/portal");
    }
  }, [me.data, router]);

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

  if (me.isPending || me.data) {
    return <p className="p-6" role="status">Checking your session…</p>;
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
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
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
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
        </div>
        <p
          role="note"
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Not validated for live payroll. Regulatory, annual-tax/BIR 2316 and
          bank-file checks remain outstanding.
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/demo" className="underline underline-offset-4">
            Try the separate demo
          </Link>
        </p>
      </div>
    </main>
  );
}
