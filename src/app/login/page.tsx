import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginCard } from "@/components/LoginCard";

interface LoginPageProps {
  searchParams?: {
    from?: string;
  };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  const from = searchParams?.from && searchParams.from.startsWith("/") ? searchParams.from : "/dashboard";
  return <LoginCard from={from} />;
}
