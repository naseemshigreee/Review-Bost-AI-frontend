
"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  getBusinesses,
  saveBusinesses,
  starterBusiness,
  makeBusinessId,
  createQrUrl,
  type Business,
  type FeedbackCategory,
} from "@/lib/business-store";

const BUSINESS_TYPES = [
  "General Business",
  "Restaurant / Cafe",
  "Hotel / Hospitality",
  "Salon / Beauty",
  "Healthcare",
  "Retail Store",
  "Software / Agency",
  "Education",
  "Other",
];

function cloneStarterBusiness(): Business {
  return {
    ...starterBusiness,
    categories: starterBusiness.categories.map((category) => ({
      ...category,
      options: [...category.options],
    })),
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function AdminPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [origin, setOrigin] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("General Business");
  const [newReviewUrl, setNewReviewUrl] = useState("");

  // Initialize browser-only data after the page mounts.
  
useEffect(() => {
  setOrigin(window.location.origin);

  try {
    const existing = getBusinesses();

    setBusinesses(existing);
    setSelectedId(existing[0]?.id ?? "");
    setError("");
  } catch (error) {
    console.error("Admin initialization error:", error);

    setBusinesses([]);
    setSelectedId("");
    setError(
      error instanceof Error
        ? error.message
        : "Could not load businesses. Please check browser storage."
    );
  } finally {
    setReady(true);
  }
}, []);


  const business = businesses.find((item) => item.id === selectedId);

  const qrUrl = useMemo(() => {
    if (!business || !origin) return "";

    try {
      return createQrUrl(business, origin);
    } catch (err) {
      console.error("Could not create customer URL:", err);
      return "";
    }
  }, [business, origin]);

  
function persist(items: Business[]): boolean {
  try {
    saveBusinesses(items);
    setError("");
    return true;
  } catch (error) {
    console.error("Could not save businesses:", error);

    setError(
      error instanceof Error
        ? error.message
        : "Could not save changes in browser storage."
    );

    return false;
  }
}


  function updateBusiness(patch: Partial<Business>) {
    if (!business) return;

    setBusinesses((current) =>
      current.map((item) =>
        item.id === business.id ? { ...item, ...patch } : item
      )
    );

    setSaved(false);
    setError("");
  }

  function saveCurrent() {
    if (!business) {
      setError("Create or select a business first.");
      return;
    }

    if (!business.name.trim()) {
      setError("Please enter a business name.");
      return;
    }

    if (!isValidHttpUrl(business.reviewUrl)) {
      setError("Enter a valid review URL starting with https:// or http://.");
      return;
    }

    if (business.categories.length === 0) {
      setError("Add at least one feedback category.");
      return;
    }

    const cleanedCategories = business.categories.map((category) => ({
      ...category,
      name: category.name.trim(),
      options: category.options
        .map((option) => option.trim())
        .filter(Boolean),
    }));

    if (
      cleanedCategories.some(
        (category) => !category.name || category.options.length === 0
      )
    ) {
      setError(
        "Every feedback category needs a name and at least one rating option."
      );
      return;
    }

    const updated = businesses.map((item) =>
      item.id === business.id
        ? {
            ...item,
            name: item.name.trim(),
            reviewUrl: business.reviewUrl.trim(),
            welcome: item.welcome.trim(),
            categories: cleanedCategories,
          }
        : item
    );

    if (persist(updated)) {
      setBusinesses(updated);
      setSaved(true);
    }
  }

  function createBusiness() {
    const name = newName.trim();

    if (!name) {
      setError("Enter a business name.");
      return;
    }

    if (!isValidHttpUrl(newReviewUrl)) {
      setError("Enter a valid review destination URL.");
      return;
    }

    const fresh: Business = {
      ...cloneStarterBusiness(),
      id: makeBusinessId(name),
      name,
      type: newType,
      reviewUrl: newReviewUrl.trim(),
      categories: starterBusiness.categories.map((category) => ({
        ...category,
        id: `${category.id}-${Math.random().toString(36).slice(2, 8)}`,
        options: [...category.options],
      })),
      active: true,
    };

    const updated = [...businesses, fresh];

    if (!persist(updated)) return;

    setBusinesses(updated);
    setSelectedId(fresh.id);
    setSaved(true);
    setShowCreate(false);
    setNewName("");
    setNewType("General Business");
    setNewReviewUrl("");
    setError("");
  }

  function removeBusiness() {
    if (!business) return;

    const confirmed = window.confirm(
      `Delete "${business.name}" from this browser?`
    );

    if (!confirmed) return;

    let updated = businesses.filter((item) => item.id !== business.id);

    if (updated.length === 0) {
      updated = [cloneStarterBusiness()];
    }

    if (!persist(updated)) return;

    setBusinesses(updated);
    setSelectedId(updated[0].id);
    setSaved(true);
  }

  function updateCategory(
    categoryId: string,
    patch: Partial<FeedbackCategory>
  ) {
    if (!business) return;

    updateBusiness({
      categories: business.categories.map((category) =>
        category.id === categoryId ? { ...category, ...patch } : category
      ),
    });
  }

  function addCategory() {
    if (!business) return;

    const category: FeedbackCategory = {
      id: `category-${Math.random().toString(36).slice(2, 9)}`,
      name: "New feedback category",
      options: ["Excellent", "Good", "Average", "Needs improvement"],
    };

    updateBusiness({
      categories: [...business.categories, category],
    });
  }

  function deleteCategory(categoryId: string) {
    if (!business) return;

    if (business.categories.length <= 1) {
      setError("Keep at least one feedback category.");
      return;
    }

    updateBusiness({
      categories: business.categories.filter(
        (category) => category.id !== categoryId
      ),
    });
  }

  function moveCategory(index: number, direction: -1 | 1) {
    if (!business) return;

    const categories = [...business.categories];
    const target = index + direction;

    if (target < 0 || target >= categories.length) return;

    [categories[index], categories[target]] = [
      categories[target],
      categories[index],
    ];

    updateBusiness({ categories });
  }

  // Download the QR code as a high-resolution PNG.
  function downloadQr() {
    if (!business || !qrUrl) {
      setError("The QR code is not ready yet.");
      return;
    }

    const canvas = document.querySelector("#business-qr canvas");

    if (!(canvas instanceof HTMLCanvasElement)) {
      setError("Could not find the QR code. Please refresh the page.");
      return;
    }

    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          setError("Could not create the PNG file. Please try again.");
          return;
        }

        const safeName =
          business.name
            .trim()
            .replace(/[^a-z0-9-_]+/gi, "-")
            .replace(/^-+|-+$/g, "") || "business";

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `${safeName}-qr.png`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        setError("");
      }, "image/png");
    } catch (error) {
      console.error("QR PNG download error:", error);
      setError("Could not download the QR code. Please try again.");
    }
  }

  function previewCustomer() {
    if (!business || !qrUrl) {
      setError("The customer URL is not ready yet.");
      return;
    }

    if (!business.active) {
      setError("Activate this business before previewing its customer page.");
      return;
    }

    if (!isValidHttpUrl(business.reviewUrl)) {
      setError("Enter a valid review destination URL first.");
      return;
    }

    // Save the current workspace before opening the customer page.
    const updated = businesses.map((item) =>
      item.id === business.id
        ? {
            ...item,
            name: item.name.trim(),
            reviewUrl: item.reviewUrl.trim(),
          }
        : item
    );

    if (!persist(updated)) return;

    setBusinesses(updated);
    setSaved(true);

    // Open directly from the button click to reduce popup-blocker issues.
    window.open(qrUrl, "_blank", "noopener,noreferrer");
  }

  if (!ready) {
    return (
      <main className="admin-shell">
        <div className="panel" style={{ margin: 32, padding: 24 }}>
          Loading your business workspace…
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="topbar">
        <a className="brand" href="/admin">
          <span className="brand-mark">✦</span>
          <span>
            ReviewBoost <b>AI</b>
          </span>
        </a>
        <span className="topbar-note">TURN FEEDBACK INTO GROWTH</span>
      </header>

      <section className="admin-hero">
        <p className="eyebrow">BUSINESS WORKSPACE</p>
        <h1>
          Admin <span>Panel</span>
        </h1>
        <p>
          Configure your business, customize feedback, and create your QR code.
        </p>
      </section>

      <section className="admin-layout">
        <aside className="panel sidebar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WORKSPACE</p>
              <h2>Your businesses</h2>
            </div>

            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setError("");
                setShowCreate(true);
              }}
              aria-label="Add business"
              title="Add business"
            >
              +
            </button>
          </div>

          <div className="business-list">
            {businesses.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`business-item ${
                  item.id === selectedId ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedId(item.id);
                  setSaved(false);
                  setError("");
                }}
              >
                <span className="business-avatar">
                  {item.name.slice(0, 1).toUpperCase() || "B"}
                </span>

                <span className="business-item-text">
                  <strong>{item.name}</strong>
                  <small>{item.type}</small>
                </span>

                <span
                  className={`status-dot ${item.active ? "" : "inactive"}`}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            className="secondary-button full-width"
            onClick={() => {
              setError("");
              setShowCreate(true);
            }}
          >
            + Add another business
          </button>

          <div className="sidebar-tip">
            <span>✦</span>
            <p>Each business gets its own questions and customer QR link.</p>
          </div>
        </aside>

        {business ? (
          <div className="admin-main">
            <div className="page-heading">
              <div>
                <p className="eyebrow">BUSINESS CONFIGURATION</p>
                <h2>{business.name}</h2>
                <p className="muted">
                  Configure your details, then save your changes.
                </p>
              </div>

              <span className="status-pill">
                {business.active ? "● Active" : "○ Inactive"}
              </span>
            </div>

            <section className="panel form-panel">
              <div className="section-heading">
                <div>
                  <span className="step-label">01 / BUSINESS PROFILE</span>
                  <h3>Make it yours</h3>
                </div>
                <span className="heading-icon">▧</span>
              </div>

              <div className="form-grid">
                <label className="field">
                  Business name
                  <input
                    value={business.name}
                    onChange={(event) =>
                      updateBusiness({ name: event.target.value })
                    }
                    placeholder="e.g. Bluebird Cafe"
                  />
                </label>

                <label className="field">
                  Business type
                  <select
                    value={business.type}
                    onChange={(event) =>
                      updateBusiness({ type: event.target.value })
                    }
                  >
                    {BUSINESS_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field field-wide">
                  Welcome message
                  <textarea
                    value={business.welcome}
                    onChange={(event) =>
                      updateBusiness({ welcome: event.target.value })
                    }
                    rows={2}
                    placeholder="Write a friendly welcome message."
                  />
                </label>

                <label className="field">
                  Accent color
                  <div className="color-input">
                    <input
                      type="color"
                      value={business.accent || "#398bff"}
                      onChange={(event) =>
                        updateBusiness({ accent: event.target.value })
                      }
                    />
                    <span>
                      {(business.accent || "#398bff").toUpperCase()}
                    </span>
                  </div>
                </label>

                <label className="field">
                  Customer page status
                  <select
                    value={business.active ? "active" : "inactive"}
                    onChange={(event) =>
                      updateBusiness({
                        active: event.target.value === "active",
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="panel form-panel">
              <div className="section-heading">
                <div>
                  <span className="step-label">02 / FEEDBACK FORM</span>
                  <h3>Customize your questions</h3>
                  <p className="muted">
                    Edit category names and rating options. Separate options
                    with commas.
                  </p>
                </div>
                <span className="heading-icon">☷</span>
              </div>

              <div className="category-list">
                {business.categories.map((category, index) => (
                  <div className="category-editor" key={category.id}>
                    <div className="category-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>

                    <div className="category-fields">
                      <label className="field">
                        Category name
                        <input
                          value={category.name}
                          onChange={(event) =>
                            updateCategory(category.id, {
                              name: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label className="field">
                        Rating options (comma-separated)
                        <input
                          value={category.options.join(", ")}
                          onChange={(event) =>
                            updateCategory(category.id, {
                              options: event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="Excellent, Good, Average, Poor"
                        />
                      </label>
                    </div>

                    <div className="category-actions">
                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => moveCategory(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => moveCategory(index, 1)}
                        disabled={index === business.categories.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        className="tiny-button danger"
                        onClick={() => deleteCategory(category.id)}
                        title="Delete category"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={addCategory}
              >
                + Add feedback category
              </button>
            </section>

            <section className="panel form-panel">
              <div className="section-heading">
                <div>
                  <span className="step-label">03 / REVIEW DESTINATION</span>
                  <h3>Where should customers go?</h3>
                </div>
                <span className="heading-icon">↗</span>
              </div>

              <label className="field">
                Review destination URL
                <input
                  type="url"
                  value={business.reviewUrl}
                  onChange={(event) =>
                    updateBusiness({ reviewUrl: event.target.value })
                  }
                  placeholder="https://..."
                />
                <small>
                  Use your real Google review link or another supported review
                  destination.
                </small>
              </label>
            </section>

            <section className="panel qr-panel">
              <div className="section-heading">
                <div>
                  <span className="step-label">04 / QR GENERATOR</span>
                  <h3>Your customer QR code</h3>
                  <p className="muted">
                    Scan this code to open the customer feedback page.
                  </p>
                </div>
                <span className="heading-icon">▦</span>
              </div>

              <div className="qr-layout">
                <div className="qr-preview">
                  {qrUrl ? (
                    
<div id="business-qr" className="qr-white">
  <QRCodeCanvas
    value={qrUrl}
    size={1200}
    level="H"
    marginSize={4}
    bgColor="#FFFFFF"
    fgColor="#000000"
    style={{
      display: "block",
      width: "240px",
      height: "240px",
    }}
  />
</div>

                  ) : (
                    <div className="qr-placeholder">
                      The QR code is not ready.
                    </div>
                  )}

                  <span className="qr-caption">SCAN TO OPEN FEEDBACK</span>
                </div>

                <div className="qr-info">
                  <span className="status-pill">● QR READY</span>
                  <h4>Ready to share your feedback page?</h4>
                  <p className="muted">
                    Save your settings before testing or downloading the QR
                    code.
                  </p>

                  <div className="button-stack">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={saveCurrent}
                    >
                      Save Settings
                    </button>

                    
<button
  type="button"
  className="secondary-button"
  onClick={downloadQr}
>
  Download QR (PNG)
</button>


                    <button
                      type="button"
                      className="secondary-button"
                      onClick={previewCustomer}
                    >
                      Preview Customer Page ↗
                    </button>

                    <button
                      type="button"
                      className="text-button danger-text"
                      onClick={removeBusiness}
                    >
                      Delete this business
                    </button>
                  </div>

                  {saved && (
                    <p className="success-message">
                      ✓ Settings saved in this browser.
                    </p>
                  )}

                  <p className="url-label">Customer URL</p>
                  <code className="url-box">
                    {qrUrl || "Customer URL unavailable."}
                  </code>
                </div>
              </div>

              <p className="notice">
                Prototype: settings are stored in this browser. The customer
                link must be publicly accessible before customers can scan the
                QR code from their own devices.
              </p>
            </section>
          </div>
        ) : (
          <div className="panel empty-panel">
            <h2>No business selected</h2>
            <p>Create a business to configure feedback and generate its QR code.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowCreate(true)}
            >
              + Create business
            </button>
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 2000,
            maxWidth: 700,
            margin: "auto",
            padding: 16,
            borderRadius: 12,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#9f1239",
            boxShadow: "0 8px 30px #00000014",
          }}
        >
          <strong>Notice:</strong> {error}
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss message"
            style={{
              float: "right",
              border: 0,
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>
      )}

      <footer className="footer">
        ReviewBoost AI <span>Honest feedback. Better experiences.</span>
      </footer>

      {showCreate && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowCreate(false);
              setError("");
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(2, 12, 30, 0.78)",
            backdropFilter: "blur(12px)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            overflowY: "auto",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-business-title"
            className="panel"
            style={{
              width: "min(100%, 520px)",
              padding: 28,
              background: "#102b4c",
              border: "1px solid rgba(125, 185, 255, 0.35)",
              borderRadius: 22,
              boxShadow: "0 25px 80px rgba(0,0,0,0.45)",
            }}
          >
            <p className="eyebrow">NEW WORKSPACE</p>
            <h2 id="create-business-title" style={{ marginTop: 8 }}>
              Create a business
            </h2>
            <p className="muted">
              Set up a business, then customize its feedback categories.
            </p>

            <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
              <label className="field">
                Business name
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createBusiness();
                  }}
                  placeholder="e.g. Bluebird Cafe"
                />
              </label>

              <label className="field">
                Business type
                <select
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                >
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Review destination URL
                <input
                  type="url"
                  value={newReviewUrl}
                  onChange={(event) => setNewReviewUrl(event.target.value)}
                  placeholder="https://..."
                />
                <small>Enter the real review page URL.</small>
              </label>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 24,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="primary-button"
                onClick={createBusiness}
              >
                Create Business
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowCreate(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
