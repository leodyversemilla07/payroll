"use client";

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
import type { FormEvent } from "react";

// shadcn/ui login-01 layout, using the components and tokens configured in @workspace/ui.
export function LoginForm({
  email,
  onEmailChange,
  onSubmit,
  isPending = false,
  error,
  preview = false,
}: {
  email?: string;
  onEmailChange?: (email: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  isPending?: boolean;
  error?: string;
  preview?: boolean;
}) {
  return (
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.(event);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  autoComplete="username"
                  value={email}
                  onChange={(event) =>
                    onEmailChange?.(event.currentTarget.value)
                  }
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <span
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    title={
                      preview ? undefined : "Password reset is not available"
                    }
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
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Logging in…" : "Login"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={!preview}
                  title={
                    preview ? undefined : "Google sign-in is not available"
                  }
                >
                  Login with Google
                </Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account?{" "}
                  <span
                    className="underline underline-offset-4"
                    title={
                      preview ? undefined : "Self-registration is not available"
                    }
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
  );
}
