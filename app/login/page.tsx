"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Button
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: "/today" })
        }
      >
        Sign in with Google
      </Button>
    </div>
  );
}
