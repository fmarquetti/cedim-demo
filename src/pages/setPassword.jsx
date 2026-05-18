import { useState } from "react";
import { Lock, Eye, EyeOff, CheckCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import logo from "../assets/logo-cedim.png";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setSuccess(true);

      setTimeout(() => {
        window.location.href = "/";
      }, 1800);
    } catch (err) {
      setError(err.message || "No se pudo definir la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <img src={logo} alt="CEDIM" className="login-logo" />
          <h1>CEDIM</h1>
          <p>Definí tu contraseña para activar el acceso al sistema.</p>
        </div>

        {success ? (
          <div className="login-success">
            <CheckCircle size={34} />
            <h3>Contraseña creada</h3>
            <p>Tu usuario fue activado correctamente. Redirigiendo...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label>
              Nueva contraseña
              <div className="password-field">
                <Lock size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Mostrar u ocultar contraseña"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label>
              Confirmar contraseña
              <div className="password-field">
                <Lock size={16} />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  aria-label="Mostrar u ocultar contraseña"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className="login-error">{error}</div>}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Crear contraseña"}
            </button>
          </form>
        )}

        <div className="login-footer">
          Acceso seguro mediante <strong>Supabase Auth</strong>
        </div>
      </section>
    </main>
  );
}