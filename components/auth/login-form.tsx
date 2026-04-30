"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const GOLD = "#B9965A";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const accountError = searchParams.get("error") === "account_deactivated";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    accountError ? "Your account has been deactivated. Contact an admin." : null
  );
  const [isPending, startTransition] = useTransition();

  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const domain = email.split("@")[1]?.toLowerCase();
    if (domain !== "americanapartners.com" && domain !== "nonzeroai.com") {
      setError("Access is restricted to americanapartners.com and nonzeroai.com accounts.");
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (authError) {
        setError("Invalid email or password.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    });
  };

  return (
    <div style={styles.root}>
      <div style={styles.grid} aria-hidden />
      <div style={styles.glow} aria-hidden />
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill={GOLD} fillOpacity="0.15" />
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke={GOLD} strokeWidth="1.5" fill="none" />
              <circle cx="16" cy="16" r="4" fill={GOLD} />
            </svg>
          </div>
          <div>
            <div style={styles.logoTitle}>Americana</div>
            <div style={styles.logoSub}>AP Aging Dashboard</div>
          </div>
        </div>

        <h1 style={styles.heading}>Sign in</h1>
        <p style={styles.subheading}>Use your Americana or NonZero AI account</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleCredentials} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="you@americanapartners.com"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...styles.primaryBtn, opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    position: "relative",
    overflow: "hidden",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(185,150,90,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(185,150,90,0.06) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
  },
  glow: {
    position: "absolute",
    top: "20%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 600,
    height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(185,150,90,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 420,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(185,150,90,0.2)",
    borderRadius: 16,
    padding: "40px 36px",
    backdropFilter: "blur(8px)",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 28 },
  logoMark: { flexShrink: 0 },
  logoTitle: { color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "Georgia, serif", letterSpacing: "0.02em" },
  logoSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 },
  heading: { color: "#fff", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" },
  subheading: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 6, marginBottom: 24 },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 13,
    padding: "10px 14px",
    marginBottom: 16,
  },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500 },
  input: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    padding: "10px 12px",
    outline: "none",
  },
  primaryBtn: {
    background: GOLD,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    padding: "11px 0",
    cursor: "pointer",
    marginTop: 4,
  },
};
