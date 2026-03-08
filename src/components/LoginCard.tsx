"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import alphaLogo from "@/app/alpha-logo.png";

export function LoginCard({ from }: { from: string }) {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
      <div className="card w-full p-8">
        <Image
          src={alphaLogo}
          alt="Alpha logo"
          width={40}
          height={40}
          className="h-10 w-10 rounded-xl object-contain shadow-sm"
          priority
        />
        <p className="label-xs">Auth</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[color:var(--ink-900)]">Sign in</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Continue to Alpha Portfolio</p>

        <button
          type="button"
          onClick={() => void signIn("google", { callbackUrl: from })}
          className="btn-primary mt-6 w-full"
        >
          Continue with Google
        </button>
      </div>
    </section>
  );
}
