import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn } from "../api/auth";
import type { ApiError } from "../api/client";
import { useAppDispatch } from "../hooks/store";
import { setCredentials } from "../store/authSlice";

const initialForm = {
  email: "",
  password: "",
};

export default function SignInPage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn(form);
      dispatch(setCredentials(result));
      navigate("/designs", { replace: true });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link
          to="/designs"
          className="auth-logo"
          aria-label="Rocketium Canvas home"
        >
          <span className="auth-logo-mark">RC</span>
          <span className="auth-logo-text">Rocketium Canvas</span>
        </Link>
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue designing.</p>
        {error && <div className="auth-error">{error}</div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-footer">
          Need an account? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}
