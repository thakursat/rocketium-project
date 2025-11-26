import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createDesign, listDesigns } from "../api/designs";
import type {
  DesignCollections,
  DesignSummary,
  DesignDetail,
} from "../types/design";
import type { ApiError } from "../api/client";
import { useAppSelector } from "../hooks/store";

export default function DesignListPage() {
  const { token, user } = useAppSelector((state) => state.auth);
  const [collections, setCollections] = useState<DesignCollections>({
    owned: [],
    public: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    listDesigns(token)
      .then((data) => {
        if (!cancelled) {
          setCollections({
            owned: data.designs.owned ?? [],
            public: data.designs.public ?? [],
          });
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
  const handleCreateDesign = async (input: {
    name: string;
    isPublic: boolean;
  }) => {
    if (!token || isCreating) return;
    setIsCreating(true);
    try {
      const result = await createDesign(
        {
          name: input.name,
          width: 1080,
          height: 1080,
          elements: [],
          isPublic: input.isPublic,
        },
        token
      );
      const summary = extractSummary(result.design);
      setCollections((prev) => {
        const owned = [summary, ...(prev?.owned ?? [])];
        const includeInPublic =
          summary.isPublic && summary.owner.id !== (user?.id ?? "");
        const publicList = includeInPublic
          ? [summary, ...(prev?.public ?? [])]
          : prev?.public ?? [];
        return { owned, public: publicList };
      });
      setIsCreateModalOpen(false);
      navigate(`/designs/${result.design._id}`);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? "Unable to create design");
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateModal = () => {
    setError(null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (isCreating) return;
    setIsCreateModalOpen(false);
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
        <button className="primary" onClick={openCreateModal}>
          New design
        </button>
      </header>
      {error && <div className="page-error">{error}</div>}
      {loading ? (
        <p>Loading designs…</p>
      ) : (
        <div className="design-sections">
          <section className="design-section">
            <header className="design-section-header">
              <div>
                <h2>My designs</h2>
                <p>
                  Your personal workspace for both private and public projects.
                </p>
              </div>
              <span className="design-count">{collections.owned.length}</span>
            </header>
            {collections.owned.length === 0 ? (
              <div className="empty-state">
                <p>No designs yet. Create your first design to get started.</p>
                <button onClick={openCreateModal}>Create design</button>
              </div>
            ) : (
              <div className="design-grid">
                {collections.owned.map((design) => (
                  <DesignCard
                    key={design._id}
                    design={design}
                    isOwner
                    currentUserId={user?.id ?? ""}
                  />
                ))}
              </div>
            )}
          </section>
          <section className="design-section">
            <header className="design-section-header">
              <div>
                <h2>Public library</h2>
                <p>
                  Explore public designs from other creators. You can jump in
                  and iterate.
                </p>
              </div>
              <span className="design-count">{collections.public.length}</span>
            </header>
            {collections.public.length === 0 ? (
              <div className="empty-state">
                <p>
                  No public designs yet. Publish one of yours to share with the
                  team.
                </p>
              </div>
            ) : (
              <div className="design-grid">
                {collections.public.map((design) => (
                  <DesignCard
                    key={design._id}
                    design={design}
                    currentUserId={user?.id ?? ""}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <CreateDesignModal
        isOpen={isCreateModalOpen}
        isSubmitting={isCreating}
        onCancel={closeCreateModal}
        onSubmit={handleCreateDesign}
      />
    </div>
  );
}

function extractSummary(design: DesignDetail): DesignSummary {
  const {
    elements: _e,
    collaboratorIds: _c,
    lastSavedAt: _l,
    ...summary
  } = design;
  return {
    ...summary,
    thumbnailUrl: summary.thumbnailUrl ?? null,
  };
}

interface CreateDesignModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; isPublic: boolean }) => void;
}

function CreateDesignModal({
  isOpen,
  isSubmitting,
  onCancel,
  onSubmit,
}: CreateDesignModalProps) {
  const [name, setName] = useState("Untitled design");
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName("Untitled design");
      setIsPublic(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onSubmit({ name: trimmed, isPublic });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-header">
          <h2>Create new design</h2>
          <p>Choose a name and visibility for your new design.</p>
        </header>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="modal-label">
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Untitled design"
                disabled={isSubmitting}
                autoFocus
                required
                minLength={2}
              />
            </label>
            <fieldset className="modal-radio-group">
              <legend>Visibility</legend>
              <label className="radio-option">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  disabled={isSubmitting}
                />
                <div>
                  <strong>Private</strong>
                  <p>Only you and invited collaborators can edit.</p>
                </div>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  disabled={isSubmitting}
                />
                <div>
                  <strong>Public</strong>
                  <p>
                    Anyone in the workspace can open and modify this design.
                  </p>
                </div>
              </label>
            </fieldset>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={isSubmitting || name.trim().length < 2}
            >
              {isSubmitting ? "Creating…" : "Create design"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DesignCardProps {
  design: DesignSummary;
  currentUserId: string;
  isOwner?: boolean;
}

function DesignCard({
  design,
  currentUserId,
  isOwner = false,
}: DesignCardProps) {
  const ownerName =
    design.owner.id === currentUserId || isOwner ? "You" : design.owner.name;
  const visibilityLabel = design.isPublic ? "Public" : "Private";

  return (
    <Link to={`/designs/${design._id}`} className="design-card">
      <div className="design-card-body">
        <div className="design-card-thumbnail" />
        <div className="design-card-content">
          <h3>{design.name}</h3>
          <p>
            Updated {new Date(design.updatedAt).toLocaleString()} •{" "}
            {design.width}×{design.height}
          </p>
        </div>
        <div className="design-card-footer">
          <span
            className={`design-card-badge ${
              design.isPublic ? "badge-public" : "badge-private"
            }`}
          >
            {visibilityLabel}
          </span>
          <span className="design-card-owner">{ownerName}</span>
        </div>
      </div>
    </Link>
  );
}
