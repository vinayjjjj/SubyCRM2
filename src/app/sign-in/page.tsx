"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const allowSignUp = process.env.NEXT_PUBLIC_AUTH_ALLOW_SIGN_UP === "true";
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
          Loading...
        </main>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackPath = useMemo(
    () => searchParams.get("callbackURL") || "/dashboard",
    [searchParams],
  );
  const authCallbackURL =
    typeof window === "undefined"
      ? callbackPath
      : new URL(callbackPath, window.location.origin).toString();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionPending && session) router.replace(callbackPath);
  }, [callbackPath, router, session, sessionPending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: name.trim() || email,
              email,
              password,
              callbackURL: authCallbackURL,
            })
          : await authClient.signIn.email({
              email,
              password,
              callbackURL: authCallbackURL,
            });

      if (result.error) {
        setError(result.error.message || "Authentication failed.");
        return;
      }

      router.replace(callbackPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: authCallbackURL,
      });
      if (result.error) setError(result.error.message || "Google sign-in failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-8 text-foreground">
      <Card className="w-full max-w-[390px]">
        <CardHeader className="pb-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border border-neutral-200/50" style={{ backgroundColor: "var(--logo-bg)" }}>
              <svg width="28" height="23" viewBox="0 0 28 23" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-[23px] w-[28px]">
                <path d="M26.909 11.6757C27.1422 11.2682 27.7767 11.2924 27.8508 11.756C27.912 12.1386 27.9434 12.5277 27.9434 12.9221L27.9422 13.0523C27.8455 18.5588 21.6278 23.0012 13.9717 23.0012L13.6112 22.9981C6.12137 22.8612 0.0964018 18.4721 0.00120746 13.0523L0 12.9221C0 12.6453 0.0154857 12.3712 0.0458512 12.1001C0.0979141 11.6352 0.724876 11.5804 0.975115 11.9756C3.0944 15.3227 8.06169 17.6717 13.8517 17.6718C19.8132 17.6718 24.9024 15.1815 26.909 11.6757Z" fill="var(--logo-fill)"/>
                <path d="M13.4904 16.071C6.27475 15.961 0.481546 12.4061 0.481534 8.03683L0.482553 7.93295C0.574946 3.54219 6.51771 2.16109e-07 13.835 0L13.835 1.16329C10.5725 1.16329 8.2581 1.48543 5.95295 3.07411C3.74776 4.5939 3.58813 6.17292 3.74007 7.1604C3.83167 7.75575 4.05017 8.34667 4.43788 8.80766C4.70264 9.12246 5.14443 9.51307 5.95295 9.99969C7.79068 11.1057 10.5725 11.9105 13.835 11.9105C17.0976 11.9105 19.8794 11.1057 21.7171 9.99969C21.929 9.87216 22.1184 9.74783 22.2877 9.62763C23.4395 8.80992 24.1691 7.30939 23.9705 5.9109C23.8388 4.98418 23.2914 3.91957 21.7171 3.07411C19.8794 1.96808 17.0976 1.16329 13.835 1.16329L13.835 0L14.1797 0.00264375C21.3953 0.112664 27.1885 3.66755 27.1885 8.03683C27.1885 12.4754 21.21 16.0737 13.835 16.0737L13.4904 16.071Z" fill="var(--logo-fill)"/>
              </svg>
            </div>
            <div>
              <CardTitle>Suby Contacts</CardTitle>
              <CardDescription className="mt-1">Internal relationship CRM</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            {mode === "sign-up" && (
              <Label>
                Name
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Gaspard"
                />
              </Label>
            )}

            <Label>
              Email
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="founder@suby.fi"
                required
                type="email"
              />
            </Label>

            <Label>
              Password
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                minLength={8}
                placeholder="Minimum 8 characters"
                required
                type="password"
              />
            </Label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <Button disabled={loading} type="submit" className="mt-1 w-full">
              {loading ? "Please wait..." : mode === "sign-up" ? "Create account" : "Sign in"}
            </Button>
          </form>

          {googleEnabled && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200" />
                or
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
              <Button
                disabled={loading}
                onClick={continueWithGoogle}
                type="button"
                variant="outline"
                className="w-full"
              >
                Continue with Google
              </Button>
            </>
          )}

          {allowSignUp && (
            <Button
              onClick={() => {
                setError(null);
                setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
              }}
              variant="ghost"
              className="mt-3 w-full"
              type="button"
            >
              {mode === "sign-up" ? "Use existing account" : "Create first account"}
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
