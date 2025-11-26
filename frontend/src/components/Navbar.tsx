import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearCredentials } from "../store/authSlice";
import { useAppDispatch, useAppSelector } from "../hooks/store";

export function Navbar() {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const initials = useMemo(() => {
    if (!user?.name) return "RC";
    const parts = user.name.trim().split(/\s+/);
    const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase());
    return letters.filter(Boolean).join("") || "RC";
  }, [user?.name]);

  const handleProfileNavigate = () => {
    setMenuOpen(false);
    navigate("/profile");
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    dispatch(clearCredentials());
    navigate("/signin", { replace: true });
  };

  return (
    <nav className="app-navbar" aria-label="Main navigation">
      <div className="navbar-brand">
        <Link to="/designs" className="navbar-logo">
          <span className="navbar-logo-mark">RC</span>
          <span className="navbar-logo-text">Rocketium Canvas</span>
        </Link>
      </div>
      <div className="navbar-actions">
        <div className="navbar-profile" ref={menuRef}>
          <button
            type="button"
            className="navbar-profile-trigger"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="navbar-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="navbar-username">{user?.name ?? "Account"}</span>
            <span className="navbar-caret" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="navbar-menu" role="menu">
              <button
                type="button"
                onClick={handleProfileNavigate}
                role="menuitem"
              >
                View profile
              </button>
              <button type="button" onClick={handleSignOut} role="menuitem">
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
