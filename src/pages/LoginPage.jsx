import React, { useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { B, AdforceLogo } from "../brand.jsx";
import { isValidPortalRole } from "../utils.js";
import { apiLogin } from "../api.js";
import { TextInput, ErrBox } from "../components/ui.jsx";

export function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (loading) return;
    setErr("");
    if (!email.trim() || !pw.trim()) {
      setErr("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiLogin(email.trim(), pw);
      if (!data.ok || !data.user) {
        setErr(data.error || "Incorrect email or password.");
        return;
      }
      const u = data.user;
      if (u.status === "inactive") {
        setErr("This account is inactive. Contact your administrator.");
        return;
      }
      if (!isValidPortalRole(u.role)) {
        setErr("This account role is not supported. Contact your HR administrator.");
        return;
      }
      onLogin(u, pw, data.sessionToken);
    } catch (e) {
      setErr(e.message || "Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <AdforceLogo boxWidth={240} boxHeight={96} align="center" />
          <p className="text-sm mt-4" style={{ color: "#7aa8bf" }}>HR Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <h2 className="text-lg font-bold mb-1" style={{ color: B.dark }}>Sign in to your account</h2>
          <p className="text-xs text-slate-500 mb-5">Use your work email and password. Your dashboard is based on your assigned role.</p>
          <ErrBox msg={err} />
          <div className="space-y-4">
            <TextInput
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@adforce.com"
              required
              Icon={Mail}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-8 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
              style={{ background: B.dark }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-xs text-center text-slate-400">
              Forgot your password? Contact your HR administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
