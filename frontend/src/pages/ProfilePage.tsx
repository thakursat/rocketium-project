import { Link } from "react-router-dom";
import { useAppSelector } from "../hooks/store";

export default function ProfilePage() {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Profile</h1>
          <p className="page-subtitle">
            Review your account details for Rocketium Canvas.
          </p>
        </div>
        <Link className="button-secondary" to="/designs">
          Back to designs
        </Link>
      </header>
      <section className="profile-card">
        {user ? (
          <>
            <h2>{user.name}</h2>
            <p className="profile-email">{user.email}</p>
            <dl className="profile-meta">
              <div>
                <dt>User ID</dt>
                <dd>{user.id}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p>No user details available.</p>
        )}
      </section>
    </div>
  );
}
