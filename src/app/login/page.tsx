import Link from "next/link";
import { login } from "@/app/actions";
import { AuthForm } from "@/app/components/auth-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm action={login} submitLabel="Email me a sign-in link" />
      <p className="text-sm">
        Have an invite? <Link href="/signup" className="underline">Create your account</Link>
      </p>
    </div>
  );
}
