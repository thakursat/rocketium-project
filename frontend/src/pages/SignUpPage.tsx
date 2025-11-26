import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "../api/auth";
import type { ApiError } from "../api/client";
import { useAppDispatch } from "../hooks/store";
import { setCredentials } from "../store/authSlice";

const initialForm = {
  name: "",
  email: "",
  password: "",
};

export default function SignUpPage() {
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
      const result = await signUp(form);
      dispatch(setCredentials(result));
      navigate("/designs", { replace: true });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? "Unable to sign up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create an account</h1>
        <p className="auth-subtitle">Collaborate on designs with your team.</p>
        {error && <div className="auth-error">{error}</div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              minLength={2}
            />
          </label>
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
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
