// ReviewBoost AI — Backend API client (TypeScript)
// Replaces the old localStorage-based business-store with real backend calls.

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
    "https://review-boost-ai-backend-production.up.railway.app"
).replace(/\/$/, "");

export const API_BASE = API_URL;

// ---- Token management ----
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("rb_admin_token");
  } catch {
    return null;
  }
}

function setToken(token: string) {
  try {
    sessionStorage.setItem("rb_admin_token", token);
  } catch {
    /* ignore */
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem("rb_admin_token");
  } catch {
    /* ignore */
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ---- Core request helper ----
async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; admin?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.admin) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Please check your internet and try again."
    );
  }

  if (res.status === 204) return null as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    const message =
      typeof d === "string"
        ? d
        : d?.message ||
          (Array.isArray(d)
            ? d.map((e: { msg: string }) => e.msg).join(", ")
            : "Something went wrong.");
    const err = new Error(message) as Error & {
      status?: number;
      code?: string;
      missing?: string[];
    };
    err.status = res.status;
    err.code = d?.code;
    err.missing = d?.missing;
    throw err;
  }
  return data as T;
}

// ---- Types (matching backend models) ----
export type BackendCategory = {
  id: string;
  name: string;
  description: string;
  required: boolean;
};

export type BackendRatingOption = {
  label: string;
  score: number;
};

export type BackendBusiness = {
  id: string;
  name: string;
  business_type: string;
  logo_url: string | null;
  brand_color: string;
  welcome_message: string;
  status: "active" | "inactive";
  review_destination_url: string | null;
  categories: BackendCategory[];
  rating_options: BackendRatingOption[];
  created_at: string;
  updated_at: string;
  customer_url: string;
  qr_png_url: string;
};

export type PublicBusiness = Omit<
  BackendBusiness,
  "customer_url" | "qr_png_url" | "status" | "created_at" | "updated_at"
>;

export type Template = {
  key: string;
  label: string;
  categories: { name: string; description: string; required: boolean }[];
  rating_options: BackendRatingOption[];
};

export type DashboardStats = {
  total_businesses: number;
  active_businesses: number;
  total_visits: number;
  drafts_generated: number;
  copy_and_open_clicks: number;
  per_business: {
    id: string;
    name: string;
    status: string;
    visits: number;
    drafts_generated: number;
    copy_and_open_clicks: number;
  }[];
  recent_activity: {
    event_type: string;
    created_at: string;
    business_name: string;
  }[];
  note: string;
};

export type GenerateReviewResult = {
  review: string;
  source: "ai" | "fallback";
  fallback_reason: string | null;
  warnings: string[];
  disclaimer: string;
};

// ---- Admin API ----
export async function adminLogin(
  password: string
): Promise<{ token: string; expires_in_hours: number }> {
  const data = await request<{ token: string; expires_in_hours: number }>(
    "/api/admin/login",
    { method: "POST", body: { password } }
  );
  setToken(data.token);
  return data;
}

export function adminLogout() {
  clearToken();
}

export const getDashboard = () =>
  request<DashboardStats>("/api/admin/dashboard", { admin: true });

export const getTemplates = () =>
  request<Template[]>("/api/admin/templates", { admin: true });

export const listBusinesses = () =>
  request<BackendBusiness[]>("/api/admin/businesses", { admin: true });

export const getBusiness = (id: string) =>
  request<BackendBusiness>(`/api/admin/businesses/${id}`, { admin: true });

export type BusinessInput = {
  name: string;
  business_type: string;
  logo_url: string | null;
  brand_color: string;
  welcome_message: string;
  status: "active" | "inactive";
  review_destination_url: string | null;
  categories: {
    id?: string;
    name: string;
    description: string;
    required: boolean;
  }[];
  rating_options: { label: string; score: number }[];
};

export function createBusiness(b: BusinessInput) {
  return request<BackendBusiness>("/api/admin/businesses", {
    method: "POST",
    body: b,
    admin: true,
  });
}

export function updateBusiness(id: string, b: BusinessInput) {
  return request<BackendBusiness>(`/api/admin/businesses/${id}`, {
    method: "PUT",
    body: b,
    admin: true,
  });
}

export function setBusinessStatus(id: string, status: "active" | "inactive") {
  return request<BackendBusiness>(`/api/admin/businesses/${id}/status`, {
    method: "PATCH",
    body: { status },
    admin: true,
  });
}

export function deleteBusiness(id: string) {
  return request<null>(`/api/admin/businesses/${id}`, {
    method: "DELETE",
    admin: true,
  });
}

export function qrUrl(id: string, download = false) {
  return `${API_URL}/api/qr/${id}.png${download ? "?download=true" : ""}`;
}

// ---- Customer (public) API ----
export function getPublicBusiness(
  id: string,
  preview = false
): Promise<PublicBusiness> {
  return request<PublicBusiness>(
    `/api/public/business/${id}${preview ? "?preview=true" : ""}`
  );
}

export function generateReview(
  id: string,
  answers: { category_id: string; rating: string }[],
  comment: string,
  regenerate = false
): Promise<GenerateReviewResult> {
  return request<GenerateReviewResult>(
    `/api/public/business/${id}/generate-review`,
    { method: "POST", body: { answers, comment, regenerate } }
  );
}

export function trackCopyAndOpen(id: string): Promise<null> {
  return request<null>(`/api/public/business/${id}/events`, {
    method: "POST",
    body: { event: "copy_and_open_clicked" },
  });
}

export const DEFAULT_RATING_OPTIONS: BackendRatingOption[] = [
  { label: "Excellent", score: 4 },
  { label: "Good", score: 3 },
  { label: "Average", score: 2 },
  { label: "Needs improvement", score: 1 },
];