import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

export function LoginPage() {
  const { login }   = useAuth();
  const navigate    = useNavigate();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: loginError } = await login(email, password);

    setSubmitting(false);

    if (loginError) {
      setError(loginError);
      return;
    }

    navigate("/", { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          <img src={DEFAULT_LOGO_URL} alt="SickFit" className="login-logo" />
          <h1>SickFit Nexus</h1>
          <p className="muted">Sign in to continue</p>
        </div>

        {error && (
          <div className="form-error" role="alert">
            <p className="error-copy">{error}</p>
          </div>
        )}

        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <div className="field field-wide">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="field field-wide">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="field field-wide">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !email || !password}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
