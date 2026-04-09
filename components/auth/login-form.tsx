"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const GOLD = "#B9965A";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [oauthPending, setOauthPending] = useState(false);

  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side domain check before round-tripping the server
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain !== "americanapartners.com" && domain !== "nonzeroai.com") {
      setError("Access is restricted to americanapartners.com and nonzeroai.com accounts.");
      return;
    }

    startTransition(async () => {
      const res = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    });
  };

  const handleMicrosoft = () => {
    setError(null);
    setOauthPending(true);
    signIn("microsoft-entra-id", { callbackUrl });
  };

  const loading = isPending || oauthPending;

  return (
    <div style={styles.root}>
      {/* Background grid lines */}
      <div style={styles.grid} aria-hidden />

      {/* Glow accent */}
      <div style={styles.glow} aria-hidden />

      <div style={styles.card}>
        {/* Logomark */}
        <div style={styles.logoWrap}>
          <div style={styles.logoBox}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="1" y="1" width="26" height="26" stroke={GOLD} strokeWidth="1.5" />
              <rect x="6" y="6" width="16" height="16" stroke={GOLD} strokeWidth="1" opacity="0.5" />
              <line x1="14" y1="1" x2="14" y2="27" stroke={GOLD} strokeWidth="1" opacity="0.4" />
              <line x1="1" y1="14" x2="27" y2="14" stroke={GOLD} strokeWidth="1" opacity="0.4" />
              <rect x="10" y="10" width="8" height="8" fill={GOLD} opacity="0.9" />
            </svg>
          </div>
          <div>
            <div style={styles.logoTitle}>NRT Consulting</div>
            <div style={styles.logoSub}>AP Aging Dashboard</div>
          </div>
        </div>

        <div style={styles.dividerTop} />

        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.subheading}>Sign in to access your reports</p>

        {/* Microsoft button */}
        <button
          type="button"
          onClick={handleMicrosoft}
          disabled={loading}
          style={{
            ...styles.msBtn,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <MicrosoftIcon />
          <span>Continue with Microsoft Outlook</span>
        </button>

        {/* Divider */}
        <div style={styles.orRow}>
          <div style={styles.orLine} />
          <span style={styles.orText}>or sign in with email</span>
          <div style={styles.orLine} />
        </div>

        {/* Credentials form */}
        <form onSubmit={handleCredentials} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label} htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="you@americanapartners.com"
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = GOLD)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = GOLD)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="7" cy="7" r="6.5" stroke="#f87171" />
                <line x1="7" y1="4" x2="7" y2="8" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="7" cy="10" r="0.75" fill="#f87171" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? (
              <span style={styles.spinner} />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div style={styles.dividerBottom} />
        <p style={styles.restriction}>
          Access restricted to <span style={{ color: GOLD }}>americanapartners.com</span> and{" "}
          <span style={{ color: GOLD }}>nonzeroai.com</span> accounts
        </p>
      </div>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    backgroundColor: "#0f0f10",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(185,150,90,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(185,150,90,0.06) 1px, transparent 1px)
    `,
    backgroundSize: "48px 48px",
    pointerEvents: "none",
  },
  glow: {
    position: "absolute",
    top: "-20%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "600px",
    height: "400px",
    background: "radial-gradient(ellipse, rgba(185,150,90,0.10) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "#16161a",
    border: "1px solid rgba(185,150,90,0.2)",
    borderRadius: "4px",
    padding: "40px",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(185,150,90,0.05) inset",
  },
  logoWrap: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "28px",
  },
  logoBox: {
    flexShrink: 0,
  },
  logoTitle: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#f0ece4",
    letterSpacing: "0.04em",
    fontFamily: "'Georgia', serif",
  },
  logoSub: {
    fontSize: "11px",
    color: "rgba(185,150,90,0.8)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginTop: "2px",
    fontFamily: "'Georgia', serif",
  },
  dividerTop: {
    height: "1px",
    background: "linear-gradient(90deg, transparent, rgba(185,150,90,0.3), transparent)",
    marginBottom: "28px",
  },
  heading: {
    fontSize: "22px",
    fontWeight: 600,
    color: "#f0ece4",
    margin: "0 0 6px 0",
    letterSpacing: "-0.01em",
    fontFamily: "'Georgia', serif",
  },
  subheading: {
    fontSize: "13px",
    color: "rgba(240,236,228,0.45)",
    margin: "0 0 24px 0",
    fontFamily: "'Georgia', serif",
  },
  msBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "11px 16px",
    backgroundColor: "#1e1e24",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "3px",
    color: "#f0ece4",
    fontSize: "13.5px",
    fontFamily: "'Georgia', serif",
    letterSpacing: "0.01em",
    transition: "border-color 0.2s, background-color 0.2s",
  },
  orRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "20px 0",
  },
  orLine: {
    flex: 1,
    height: "1px",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  orText: {
    fontSize: "11px",
    color: "rgba(240,236,228,0.35)",
    whiteSpace: "nowrap",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontFamily: "'Georgia', serif",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "11.5px",
    color: "rgba(240,236,228,0.5)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontFamily: "'Georgia', serif",
  },
  input: {
    width: "100%",
    padding: "10px 13px",
    backgroundColor: "#0f0f10",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "3px",
    color: "#f0ece4",
    fontSize: "14px",
    fontFamily: "'Georgia', serif",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "10px 12px",
    backgroundColor: "rgba(248,113,113,0.07)",
    border: "1px solid rgba(248,113,113,0.25)",
    borderRadius: "3px",
    color: "#f87171",
    fontSize: "12.5px",
    fontFamily: "'Georgia', serif",
    lineHeight: "1.4",
  },
  submitBtn: {
    width: "100%",
    padding: "11px",
    backgroundColor: GOLD,
    border: "none",
    borderRadius: "3px",
    color: "#0f0f10",
    fontSize: "13.5px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontFamily: "'Georgia', serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.15s",
    marginTop: "4px",
  },
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid rgba(15,15,16,0.3)",
    borderTop: "2px solid #0f0f10",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },
  dividerBottom: {
    height: "1px",
    background: "linear-gradient(90deg, transparent, rgba(185,150,90,0.2), transparent)",
    margin: "28px 0 16px",
  },
  restriction: {
    fontSize: "11px",
    color: "rgba(240,236,228,0.3)",
    textAlign: "center",
    lineHeight: "1.5",
    fontFamily: "'Georgia', serif",
  },
};
