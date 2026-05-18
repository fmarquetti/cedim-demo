import { useState } from "react";
import logo from "../assets/logo-cedim.png";
import { loginWithEmail } from "../services/authService";
import { useAppConfig } from "../context/AppConfigContext";

export default function Login({ onLogin }) {
  const { config } = useAppConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loginLogo = config.loginIconUrl || config.platformIconUrl || logo;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await loginWithEmail(email, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <img
            src={loginLogo}
            alt={config.loginTitle || config.platformName || "CEDIM"}
            className="login-logo"
          />

          <h1>{config.loginTitle || "CEDIM"}</h1>

          <p>
            {config.loginSubtitle ||
              "Centro de estudios digestivos de Mendoza"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="login-footer">
          {config.loginFooterText || "CEDIM · Versión"}{" "}
          <strong>{config.loginFooterHighlight || "SUPABASE"}</strong>
        </div>
      </section>
    </main>
  );
}