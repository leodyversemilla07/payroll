import { LoginForm } from "@/components/login-form";

export default function LoginPreview() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm preview />
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
