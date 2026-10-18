
export type FeedbackCategory = {
  id: string;
  name: string;
  options: string[];
};

export type Business = {
  id: string;
  name: string;
  type: string;
  welcome: string;
  reviewUrl: string;
  accent: string;
  categories: FeedbackCategory[];
  active: boolean;
};

const STORAGE_KEY = "reviewboost-businesses-v1";

export const defaultCategories: FeedbackCategory[] = [
  {
    id: "quality",
    name: "Quality of Product or Service",
    options: ["Excellent", "Good", "Average", "Needs improvement"],
  },
  {
    id: "service",
    name: "Customer Service",
    options: ["Excellent", "Good", "Average", "Needs improvement"],
  },
  {
    id: "experience",
    name: "Overall Experience",
    options: ["Excellent", "Good", "Average", "Needs improvement"],
  },
];

export const starterBusiness: Business = {
  id: "demo-business",
  name: "My Business",
  type: "General Business",
  welcome: "Your feedback helps us improve. Tell us about your experience.",
  reviewUrl: "https://www.google.com/",
  accent: "#2d83f7",
  categories: defaultCategories.map((category) => ({
    ...category,
    options: [...category.options],
  })),
  active: true,
};

function isBusiness(value: unknown): value is Business {
  if (!value || typeof value !== "object") return false;

  const item = value as Partial<Business>;

  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.type === "string" &&
    typeof item.welcome === "string" &&
    typeof item.reviewUrl === "string" &&
    typeof item.active === "boolean" &&
    Array.isArray(item.categories) &&
    item.categories.every(
      (category) =>
        category &&
        typeof category.id === "string" &&
        typeof category.name === "string" &&
        Array.isArray(category.options) &&
        category.options.every((option) => typeof option === "string")
    )
  );
}

function cloneStarter(): Business {
  return {
    ...starterBusiness,
    categories: starterBusiness.categories.map((category) => ({
      ...category,
      options: [...category.options],
    })),
  };
}

export function getBusinesses(): Business[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      const initial = [cloneStarter()];
      saveBusinesses(initial);
      return initial;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("Saved business data is not a list.");
    }

    const valid = parsed.filter(isBusiness).map((business) => ({
      ...business,
      accent:
        typeof business.accent === "string" && business.accent
          ? business.accent
          : "#2d83f7",
      categories: business.categories.map((category) => ({
        ...category,
        options: [...category.options],
      })),
    }));

    if (valid.length === 0) {
      const initial = [cloneStarter()];
      saveBusinesses(initial);
      return initial;
    }

    return valid;
  } catch (error) {
    console.error("ReviewBoost storage read failed:", error);
    throw new Error(
      "Business data could not be read. Check browser storage or clear the old ReviewBoost data."
    );
  }
}

export function saveBusinesses(businesses: Business[]): void {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is not available yet.");
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(businesses));
  } catch (error) {
    console.error("ReviewBoost storage write failed:", error);
    throw new Error(
      "Could not save business data. Check browser storage settings."
    );
  }
}

export function makeBusinessId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  return `${slug || "business"}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createQrUrl(business: Business, origin: string): string {
  const params = new URLSearchParams();
  params.set("config", JSON.stringify(business));

  return `${origin}/review/${encodeURIComponent(business.id)}?${params.toString()}`;
}
