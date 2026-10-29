import { signup } from "@/app/actions";
import { AuthForm } from "@/app/components/auth-form";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Join with an invite</h1>
      <p className="text-sm opacity-70">Event Me AI is invite-only for now.</p>
      <AuthForm action={signup} submitLabel="Accept invite" withInviteCode />
    </div>
  );
}
