import React, { useState } from "react";
import { ChevronRight, Eye, EyeOff, Lock, Mail, ArrowLeft } from "lucide-react";
import { B, AdforceLogo } from "../brand.jsx";
import { LOGIN_ROLES, loginRoleMatchesSelection } from "../utils.js";
import { apiLogin } from "../api.js";
import { TextInput, ErrBox } from "../components/ui.jsx";

export function LoginPage({ onLogin }) {
  const [selectedRole, setSelectedRole] = useState(null);
  const [email,   setEmail]   = useState("");
  const [pw,      setPw]      = useState("");
  const [show,    setShow]    = useState(false);
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const roleConfig = LOGIN_ROLES.find(r => r.id === selectedRole);
  const RoleIcon = roleConfig?.icon;

  async function handleLogin() {
    if (loading) return;
    const roleAtLogin = selectedRole;
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
      if (!loginRoleMatchesSelection(roleAtLogin, u.role)) {
        setErr(`This account is not registered as ${roleAtLogin}. Your role is ${u.role}.`);
        return;
      }
      onLogin(u, pw);
    } catch (e) {
      setErr(e.message || "Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (loading) return;
    setSelectedRole(null);
    setEmail("");
    setPw("");
    setErr("");
    setShow(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <AdforceLogo boxWidth={240} boxHeight={96} align="center" />
          <p className="text-sm mt-4" style={{ color: "#7aa8bf" }}>HR Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          {!selectedRole ? (
            <div className="space-y-3">
              {LOGIN_ROLES.map(role => {
                const Icon = role.icon;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => { setSelectedRole(role.id); setErr(""); }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: role.color }}
                    >
                      <Icon size={20} color="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800">{role.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{role.description}</div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={goBack}
                disabled={loading}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 disabled:opacity-50 disabled:pointer-events-none"
              >
                <ArrowLeft size={16} /> Back
              </button>

              {roleConfig && RoleIcon && (
                <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: roleConfig.color }}
                  >
                    <RoleIcon size={20} color="white" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{roleConfig.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{roleConfig.description}</div>
                  </div>
                </div>
              )}

              <h2 className="text-lg font-bold mb-5" style={{ color: B.dark }}>Sign in to your account</h2>
              <ErrBox msg={err} />
              <div className="space-y-4 mt-4">
                <TextInput
                  label="Work email" type="email" value={email} onChange={setEmail}
                  placeholder="you@adforce.com" required Icon={Mail}
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
                    <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
