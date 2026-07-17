import React, { useState } from "react";
import { Check, X, Eye, EyeOff, Lock, AlertCircle } from "lucide-react";
import { B } from "../brand.jsx";

export function Pill({ tone = "slate", children }) {
  const map = {
    red:    "bg-red-100 text-red-700",
    green:  "bg-emerald-100 text-emerald-700",
    amber:  "bg-amber-100 text-amber-700",
    orange: "bg-orange-100 text-orange-700",
    dark:   "bg-slate-800 text-white",
    slate:  "bg-slate-100 text-slate-600",
    blue:   "bg-blue-100 text-blue-700",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[tone]||map.slate}`}>{children}</span>;
}

export function Avatar({ name = "?", size = 8 }) {
  const ini = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size * 4, height: size * 4, background: B.dark, color: B.white }}
      className="rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none">
      {ini}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`bg-white border border-slate-200 rounded-xl ${className}`}>{children}</div>;
}

export function STitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold" style={{ color: B.dark }}>{children}</h3>
      {right}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto z-10`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold" style={{ color: B.dark }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, required, children }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

export function TextInput({ label, type = "text", value, onChange, placeholder, required, Icon, disabled, onKeyDown }) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />}
        <input
          type={type}
          value={value}
          onChange={e => onChange && onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className={`w-full ${Icon ? "pl-8" : "pl-3"} pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-400`}
        />
      </div>
    </Field>
  );
}

export function SelectInput({ label, value, onChange, options, required }) {
  return (
    <Field label={label} required={required}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function PwInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <Lock size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "••••••••"}
          autoComplete="new-password"
          className="w-full pl-8 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900"
        />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </Field>
  );
}

export function PwStrength({ pw }) {
  if (!pw) return null;
  const checks = [
    { label: "8+ chars",  ok: pw.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(pw) },
    { label: "Number",    ok: /\d/.test(pw) },
  ];
  return (
    <div className="flex gap-1 mt-1.5">
      {checks.map(c => (
        <span key={c.label} className={`text-xs px-2 py-0.5 rounded-full ${c.ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.label}</span>
      ))}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", disabled = false, className = "" }) {
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const styles = {
    primary: { background: B.dark,   color: B.white, border: "none" },
    danger:  { background: "#dc2626",color: B.white, border: "none" },
    ghost:   { background: "transparent", color: B.dark, border: "1px solid #cbd5e1" },
    accent:  { background: B.red,    color: B.white, border: "none" },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button onClick={onClick} disabled={disabled}
      style={disabled ? { ...s, opacity: 0.4, cursor: "not-allowed" } : s}
      className={`inline-flex items-center gap-1.5 font-medium rounded-lg transition-opacity ${sz} ${className}`}>
      {children}
    </button>
  );
}

export function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="p-3 rounded-lg flex gap-2 text-sm" style={{ background: B.redLight, border: `1px solid ${B.redBorder}`, color: B.red }}>
      <AlertCircle size={16} className="shrink-0 mt-0.5" />{msg}
    </div>
  );
}

export function OkBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="p-3 rounded-lg flex gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
      <Check size={16} className="shrink-0 mt-0.5" />{msg}
    </div>
  );
}
