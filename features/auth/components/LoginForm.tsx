"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { login } from "@/features/auth/actions";
import type { dictionary } from "@/lib/i18n";

type Messages = ReturnType<typeof dictionary>;

export function LoginForm({ messages }: { messages: Messages }) {
  const [state, action, pending] = useActionState(login, {});
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className="login-form">
      <label>
        {messages.email}
        <input name="email" type="email" autoComplete="email" required placeholder="nombre@hotelyuli.com" />
      </label>
      <label>
        {messages.password}
        <span className="password-field">
          <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={8} />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? messages.hidePassword : messages.showPassword}
            aria-controls="login-password"
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </span>
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="primary-button" type="submit" disabled={pending}>
        <LogIn size={18} aria-hidden="true" />
        {pending ? messages.signingIn : messages.signIn}
      </button>
    </form>
  );
}
