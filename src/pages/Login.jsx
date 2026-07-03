import { useState } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import logo from "../assets/logo-cedim.png";
import { loginWithEmail } from "../services/authService";
import { useAppConfig } from "../context/AppConfigContext";

export default function Login({ onLogin }) {
  const { config } = useAppConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loginLogo = config.loginIconUrl || config.platformIconUrl || logo;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await loginWithEmail(email.trim(), password);
      onLogin(user);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <aside className="login-hero">
          <div className="login-hero-glow" />

          <div className="login-hero-content">
            <div className="login-hero-brand">
              <img
                src={loginLogo}
                alt={config.loginTitle || config.platformName || "CEDIM"}
              />

              <div>
                <strong>{config.platformName || "CEDIM"}</strong>
                <span>{config.platformSubtitle || "Sistema de gestion"}</span>
              </div>
            </div>

            <div className="login-hero-title">
              <span className="login-kicker">Plataforma administrativa</span>

              <h1>{config.loginTitle || "CEDIM"}</h1>

              <p>
                {config.loginSubtitle ||
                  "Centro de estudios digestivos de Mendoza"}
              </p>
            </div>

            <div className="login-hero-features">
              <div>
                <ShieldCheck size={18} />
                <span>Acceso seguro por usuario</span>
              </div>

              <div>
                <LockKeyhole size={18} />
                <span>Gestion centralizada y protegida</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="login-card">
          <div className="login-card-header">
            <span>Bienvenido</span>
            <h2>Iniciar sesion</h2>
            <p>Ingresa tus credenciales para acceder al panel principal.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-field">
              <span>Email</span>

              <div className="login-input-wrap">
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="usuario@cedim.com"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </label>

            <label className="login-field">
              <span>Contrasena</span>

              <div className="login-input-wrap">
                <LockKeyhole size={18} />

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contrasena"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? "Ocultar contrasena" : "Mostrar contrasena"
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <div className="login-error">{error}</div>}

            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar al sistema"}
            </button>
          </form>

          <div className="login-footer">
            <span>{config.loginFooterText || "CEDIM - Version"}</span>
            <strong>{config.loginFooterHighlight || "SUPABASE"}</strong>
          </div>
        </section>
      </section>
    </main>
  );
}
