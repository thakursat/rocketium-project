import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  status: "idle" | "authenticated";
}

function loadPersistedAuth(): AuthState {
  if (typeof window === "undefined") {
    return { user: null, token: null, status: "idle" };
  }

  try {
    const raw = window.localStorage.getItem("rocketium_auth");
    if (!raw) {
      return { user: null, token: null, status: "idle" };
    }
    const parsed = JSON.parse(raw) as { user: AuthUser; token: string };
    if (!parsed?.token || !parsed?.user) {
      return { user: null, token: null, status: "idle" };
    }
    return { user: parsed.user, token: parsed.token, status: "authenticated" };
  } catch (error) {
    console.warn("Failed to parse persisted auth", error);
    return { user: null, token: null, status: "idle" };
  }
}

const initialState: AuthState = loadPersistedAuth();

function persistAuth(state: AuthState) {
  if (typeof window === "undefined") {
    return;
  }
  if (state.token && state.user) {
    window.localStorage.setItem(
      "rocketium_auth",
      JSON.stringify({ token: state.token, user: state.user })
    );
  } else {
    window.localStorage.removeItem("rocketium_auth");
  }
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ token: string; user: AuthUser }>
    ) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.status = "authenticated";
      persistAuth(state);
    },
    clearCredentials(state) {
      state.token = null;
      state.user = null;
      state.status = "idle";
      persistAuth(state);
    },
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;

export const selectAuth = (state: { auth: AuthState }) => state.auth;
