import { apiRequest } from "./client";
import type { AuthUser } from "../store/authSlice";

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface SignUpPayload {
  name: string;
  email: string;
  password: string;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export async function signUp(payload: SignUpPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/signup", {
    method: "POST",
    body: payload,
  });
}

export async function signIn(payload: SignInPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/signin", {
    method: "POST",
    body: payload,
  });
}

export async function fetchMe(token: string): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>("/auth/me", {
    method: "GET",
    token,
  });
}
