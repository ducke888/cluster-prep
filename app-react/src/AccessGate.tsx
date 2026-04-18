import { useState, type ReactNode } from "react";

// Temporary invite-only password gate for the landing page. This is
// client-side only — not real security. Share the password with testers.
// To rotate, bump ACCESS_PASSWORD. To remove entirely, import and drop
// this wrapper in main.tsx.
export const ACCESS_PASSWORD = "deca2026";

function isGranted() {
  return typeof window !== "undefined" &&
    window.localStorage.getItem("deca-access-granted") === ACCESS_PASSWORD;
}

export function AccessGate({ children }: { children: ReactNode }) {
  // Allow ?pw=… shortcut so you can DM a tester a one-click link.
  if (typeof window !== "undefined") {
    const pw = new URLSearchParams(window.location.search).get("pw");
    if (pw === ACCESS_PASSWORD) {
      window.localStorage.setItem("deca-access-granted", ACCESS_PASSWORD);
    }
  }

  const [granted, setGranted] = useState(isGranted());
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  if (granted) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ACCESS_PASSWORD) {
      window.localStorage.setItem("deca-access-granted", ACCESS_PASSWORD);
      setGranted(true);
    } else {
      setErr("Wrong password.");
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#0a0714", display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "system-ui, sans-serif", color: "#f5f3ff",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          maxWidth: 360, width: "100%",
          background: "#15102a", border: "1px solid #2a2347",
          borderRadius: 12, padding: 24,
        }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: "1.15rem" }}>Private beta</h2>
        <p style={{ margin: "0 0 16px", color: "#a8a2c2", fontSize: ".88rem" }}>
          Enter the access password to continue.
        </p>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(""); }}
          style={{
            width: "100%", padding: "10px 12px",
            background: "#0a0714", border: "1px solid #3a2f5f",
            borderRadius: 8, color: "#fff", fontSize: "1rem",
            marginBottom: 10, boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%", padding: "10px 12px",
            background: "#7c3aed", color: "#fff", border: 0,
            borderRadius: 8, fontWeight: 700, cursor: "pointer",
          }}
        >
          Enter
        </button>
        <div style={{ color: "#f87171", fontSize: ".82rem", marginTop: 10, minHeight: "1em" }}>
          {err}
        </div>
      </form>
    </div>
  );
}
