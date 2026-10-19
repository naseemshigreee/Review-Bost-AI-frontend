"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  getPublicBusiness,
  generateReview,
  trackCopyAndOpen,
  APIError,
  getErrorMessage,
  isAbortError,
  type PublicBusiness,
  type GenerateReviewResult,
} from "@/lib/api";

type Answers = Record<string, string>;

const SLOW_AFTER_MS = 2500; // show "waking up" message if the backend is slow (cold start)
const RETRY_DELAYS_MS = [2000, 4000]; // retries for network failures only

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function ReviewContent() {
  const params = useParams<{ businessId: string }>();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "true";

  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [slow, setSlow] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<GenerateReviewResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const data = await getPublicBusiness(params.businessId, preview, controller.signal);
          setBusiness(data);
          break;
        } catch (err) {
          if (isAbortError(err)) return;
          const retryable = err instanceof APIError && err.code === "network";
          if (retryable && attempt < RETRY_DELAYS_MS.length) {
            await wait(RETRY_DELAYS_MS[attempt], controller.signal);
            if (controller.signal.aborted) return;
            continue;
          }
          if (err instanceof APIError && err.code === "business_inactive") {
            setLoadError("This business has paused feedback for now. Please check back later.");
          } else if (err instanceof APIError && err.status === 404) {
            setLoadError("Please scan the latest QR code provided by the business.");
          } else {
            setLoadError(getErrorMessage(err));
          }
          break;
        }
      }
      clearTimeout(slowTimer);
      setLoading(false);
    })();
    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [params.businessId, preview]);

  const accent = business?.brand_color || "#2878F0";

  const answeredCount = business
    ? business.categories.filter((cat) => Boolean(answers[cat.id])).length
    : 0;

  function selectOption(categoryId: string, option: string) {
    setAnswers((current) => ({
      ...current,
      [categoryId]: current[categoryId] === option ? "" : option,
    }));
    setError("");
    setNotice("");
    setDraft(null);
  }

  function clearAnswers() {
    setAnswers({});
    setComment("");
    setDraft(null);
    setError("");
    setNotice("");
  }

  async function handleGenerate() {
    if (!business || submitting) return;

    if (answeredCount === 0 && !comment.trim()) {
      setError("Choose an option or leave a short comment to continue.");
      return;
    }

    // Validate required categories
    const missing = business.categories.filter(
      (cat) => cat.required && !answers[cat.id]
    );
    if (missing.length > 0) {
      setError("Please answer: " + missing.map((m) => m.name).join(", "));
      return;
    }

    setError("");
    setNotice("");
    setSubmitting(true);
    setDraft(null);

    try {
      const answerList = Object.entries(answers)
        .filter(([, rating]) => rating)
        .map(([category_id, rating]) => ({ category_id, rating }));

      const result = await generateReview(
        business.id,
        answerList,
        comment.trim(),
        false
      );
      setDraft(result);
      if (result.warnings.length > 0) {
        setNotice(result.warnings.join(" "));
      }
    } catch (err) {
      setError(
        getErrorMessage(err)
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyAndOpen() {
    if (!business || !draft) return;

    let copied = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(draft.review);
        copied = true;
      }
    } catch {
      copied = false;
    }

    // Track the event (fire and forget)
    trackCopyAndOpen(business.id).catch(() => {});

    if (business.review_destination_url) {
      if (copied) {
        setNotice("Review copied! Opening the review page...");
        window.open(business.review_destination_url, "_blank", "noopener,noreferrer");
      } else {
        setNotice("Copy the text below, then open the review page.");
      }
    } else {
      setNotice("Review copied to clipboard.");
    }
  }

  async function regenerate() {
    if (!business || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const answerList = Object.entries(answers)
        .filter(([, rating]) => rating)
        .map(([category_id, rating]) => ({ category_id, rating }));

      const result = await generateReview(
        business.id,
        answerList,
        comment.trim(),
        true
      );
      setDraft(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const styles = { "--rb-accent": accent } as CSSProperties;

  if (loading) {
    return (
      <main className="rb-page" style={styles}>
        <div className="rb-state">
          <span className="rb-brand-mark">*</span>
          <h1>{slow ? "Waking up the server" : "Getting things ready"}</h1>
          <p role="status" aria-live="polite">
            {slow
              ? "The first visit can take a few seconds. Thanks for waiting..."
              : "Just a moment..."}
          </p>
        </div>
      </main>
    );
  }

  if (loadError || !business) {
    return (
      <main className="rb-page" style={styles}>
        <div className="rb-state">
          <span className="rb-brand-mark">*</span>
          <h1>{loadError.includes("paused") ? "Feedback unavailable" : "Page not found"}</h1>
          <p>{loadError || "Please scan the latest QR code provided by the business."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="rb-page" style={styles}>
      <div className="rb-background-glow rb-glow-one" />
      <div className="rb-background-glow rb-glow-two" />

      <header className="rb-topbar">
        <Link href="/" className="rb-brand" aria-label="ReviewBoost AI home">
          <span className="rb-brand-mark">*</span>
          <span>
            ReviewBoost <strong>AI</strong>
          </span>
        </Link>
        <span className="rb-top-note">
          Your feedback matters <span>*</span>
        </span>
      </header>

      <section className="rb-card">
        <div className="rb-business">
          <div className="rb-business-avatar" aria-hidden="true">
            {business.logo_url ? (
              // Admin-entered logos can live on any host, so a plain lazy <img> with fixed size is used.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logo_url}
                alt=""
                width={47}
                height={47}
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              business.name.trim().charAt(0).toUpperCase() || "B"
            )}
          </div>
          <div className="rb-business-details">
            <h1>{business.name}</h1>
            <p>{business.business_type || "Local Business"}</p>
          </div>
          <span className="rb-secure-label">
            <span className="rb-status-dot" />
            Feedback
          </span>
        </div>

        <div className="rb-intro">
          <span className="rb-kicker">A MOMENT FOR US</span>
          <h2>How was your experience?</h2>
          <p>
            {business.welcome_message ||
              "Tell us what you enjoyed. It only takes a few taps."}
          </p>
        </div>

        <div className="rb-progress">
          <div className="rb-progress-track">
            <div
              className="rb-progress-fill"
              style={{
                width: `${
                  business.categories.length
                    ? (answeredCount / business.categories.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <span>
            {answeredCount === 0
              ? "Let's get started"
              : `${answeredCount} of ${business.categories.length} answered`}
          </span>
        </div>

        <div className="rb-category-list">
          {business.categories.map((category, index) => (
            <section className="rb-category" key={category.id}>
              <div className="rb-category-heading">
                <span className="rb-category-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>
                  {category.name}
                  {category.required && (
                    <span style={{ color: "var(--rb-accent)", fontSize: 10, marginLeft: 4 }}>
                      *
                    </span>
                  )}
                </h3>
                {answers[category.id] && (
                  <span className="rb-complete">{"\u2713"}</span>
                )}
              </div>

              {category.description && (
                <p
                  style={{
                    margin: "0 0 10px",
                    color: "#7a8ca5",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  {category.description}
                </p>
              )}

              <div
                className="rb-options"
                role="group"
                aria-label={category.name}
              >
                {business.rating_options.map((option) => {
                  const selected = answers[category.id] === option.label;
                  return (
                    <button
                      type="button"
                      key={option.label}
                      className={"rb-option " + (selected ? "rb-option-selected" : "")}
                      aria-pressed={selected}
                      onClick={() => selectOption(category.id, option.label)}
                    >
                      <span className="rb-option-indicator">
                        {selected ? "\u2713" : ""}
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="rb-comment-section">
          <label htmlFor="rb-comment">
            Anything else to share?
            <span>OPTIONAL</span>
          </label>
          <textarea
            id="rb-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setError("");
              setNotice("");
            }}
            placeholder="Your thoughts help us do better..."
            maxLength={500}
            rows={3}
          />
          <div className="rb-comment-footer">
            <span>Every honest thought counts.</span>
            <span>{comment.length}/500</span>
          </div>
        </div>

        {error && (
          <div className="rb-alert rb-alert-error" role="alert">
            <span>!</span>
            <p>{error}</p>
          </div>
        )}

        {notice && (
          <div className="rb-alert rb-alert-success" role="status">
            <span>{"\u2713"}</span>
            <p>{notice}</p>
          </div>
        )}

        {draft && (
          <div className="rb-fallback">
            <label htmlFor="rb-draft">
              Your AI-generated review draft
              {draft.source === "fallback" && (
                <span style={{ marginLeft: 8, color: "#8393a9", fontSize: 10 }}>
                  (basic draft - AI unavailable)
                </span>
              )}
            </label>
            <textarea
              id="rb-draft"
              value={draft.review}
              onChange={(e) =>
                setDraft({ ...draft, review: e.target.value })
              }
              rows={5}
            />
            <p
              style={{
                margin: "4px 0 0",
                color: "#8393a9",
                fontSize: 10,
                lineHeight: 1.6,
              }}
            >
              {draft.disclaimer}
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="rb-copy-button" onClick={copyAndOpen}>
                Copy &amp; Open review page
              </button>
              <button
                type="button"
                className="rb-copy-button"
                onClick={regenerate}
                disabled={submitting}
              >
                {submitting ? "Regenerating..." : "Regenerate"}
              </button>
              {business.review_destination_url && (
                <a
                  className="rb-open-link"
                  href={business.review_destination_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ margin: 0 }}
                >
                  Open review page {"\u2197"}
                </a>
              )}
            </div>
          </div>
        )}

        {!draft && (
          <button
            type="button"
            className="rb-submit"
            onClick={handleGenerate}
            disabled={submitting}
          >
            <span>
              {submitting ? "Generating your review..." : "Generate Review"}
            </span>
            {!submitting && <span className="rb-submit-arrow">{"\u2192"}</span>}
          </button>
        )}

        <button type="button" className="rb-reset" onClick={clearAnswers}>
          Clear answers
        </button>

        <div className="rb-honesty">
          <span>*</span>
          Share feedback that reflects your actual experience.
        </div>
      </section>

      <footer className="rb-footer">
        Made with care by <strong>ReviewBoost AI</strong>
      </footer>
    </main>
  );
}

export default function CustomerReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="rb-page">
          <div className="rb-state">
            <span className="rb-brand-mark">*</span>
            <h1>Getting things ready</h1>
            <p>Just a moment...</p>
          </div>
        </main>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}
