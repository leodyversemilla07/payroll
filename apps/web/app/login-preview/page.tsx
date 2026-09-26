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
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";

export default function LoginPreview() {
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
              <form onSubmit={(event) => event.preventDefault()}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="preview-email">Email</FieldLabel>
                    <Input
                      id="preview-email"
                      type="email"
                      placeholder="m@example.com"
                      required
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor="preview-password">
                        Password
                      </FieldLabel>
                      <span className="ml-auto inline-block text-sm underline-offset-4 hover:underline">
                        Forgot your password?
                      </span>
                    </div>
                    <Input id="preview-password" type="password" required />
                  </Field>
                  <Field>
                    <Button type="submit">Login</Button>
                    <Button variant="outline" type="button">
                      Login with Google
                    </Button>
                    <FieldDescription className="text-center">
                      Don&apos;t have an account?{" "}
                      <span className="underline underline-offset-4">
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
          UI preview only. This page does not sign in or save data.
        </p>
      </div>
    </main>
  );
}
