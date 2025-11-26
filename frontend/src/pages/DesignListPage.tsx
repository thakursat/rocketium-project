import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createDesign, listDesigns } from "../api/designs";
import type { DesignSummary } from "../types/design";
import type { ApiError } from "../api/client";
import { useAppSelector } from "../hooks/store";

export default function DesignListPage() {
  const { token, user } = useAppSelector((state) => state.auth);
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    listDesigns(token)
      .then((data) => {
        if (!cancelled) {
          setDesigns(data.designs);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const apiError = err as ApiError;
          setError(apiError.message ?? "Unable to load designs");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCreateDesign = async () => {
    if (!token) return;
    const name = window.prompt("Design name", "Untitled design");
    if (!name) return;
    try {
      const result = await createDesign(
        {
          name,
          width: 1080,
          height: 1080,
          elements: [],
        },
        token
      );
      navigate(`/designs/${result.design._id}`);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? "Unable to create design");
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Your designs</h1>
          <p className="page-subtitle">
            Welcome back{user ? `, ${user.name}` : ""}!
          </p>
        </div>
        <button className="primary" onClick={handleCreateDesign}>
          New design
        </button>
      </header>
      {error && <div className="page-error">{error}</div>}
      {loading ? (
        <p>Loading designs…</p>
      ) : designs.length === 0 ? (
        <div className="empty-state">
          <p>No designs yet. Create your first design to get started.</p>
          <button onClick={handleCreateDesign}>Create design</button>
        </div>
      ) : (
        <div className="design-grid">
          {designs.map((design) => (
            <Link
              key={design._id}
              to={`/designs/${design._id}`}
              className="design-card"
            >
              <div className="design-card-body">
                <div className="design-card-thumbnail" />
                <div>
                  <h2>{design.name}</h2>
                  <p>
                    Updated {new Date(design.updatedAt).toLocaleString()} •{" "}
                    {design.width}×{design.height}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
