import React, { useState } from "react";
import { Bell, Check, LogOut, User, Save, Key, Shield, Building, Phone, Mail, ToggleLeft, ToggleRight } from "lucide-react";
import { B } from "../brand.jsx";
import { DEFAULT_ANNUAL_LEAVE, can } from "../utils.js";
import { Pill, Avatar, Card, STitle, TextInput, SelectInput, PwInput, PwStrength, Btn, ErrBox, OkBox } from "../components/ui.jsx";

export function SettingsPage({ currentUser, users, setUsers, onLogout, company, setCompany, roles }) {
  const [tab,   setTab]   = useState("profile");
  const [saved, setSaved] = useState(false);
  const [prof,  setProf]  = useState({
    name:  currentUser.name,
    email: currentUser.email,
    phone: currentUser.phone  || "",
    title: currentUser.title  || "",
    dept:  currentUser.dept   || "",
  });
  const [pw,    setPw]    = useState({ curr: "", newp: "", conf: "" });
  const [pwErr, setPwErr] = useState("");
  const [pwOk,  setPwOk]  = useState(false);
  const [notifs, setNotifs] = useState({ leave: true, payroll: true, ann: true, att: false, weekly: true });

  const canManageCompany = can(currentUser.role, "manage_company_settings", roles);

  function saveProfile() {
    setUsers(us => us.map(u => u.id === currentUser.id ? { ...u, ...prof } : u));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function changePw() {
    setPwErr(""); setPwOk(false);
    if (currentUser.password !== pw.curr)  { setPwErr("Current password is incorrect."); return; }
    if (pw.newp.length < 8)                { setPwErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw.newp))            { setPwErr("Password must include an uppercase letter."); return; }
    if (!/\d/.test(pw.newp))               { setPwErr("Password must include a number."); return; }
    if (pw.newp !== pw.conf)               { setPwErr("Passwords do not match."); return; }
    setUsers(us => us.map(u => u.id === currentUser.id ? { ...u, password: pw.newp } : u));
    setPwOk(true); setPw({ curr: "", newp: "", conf: "" });
  }

  const tabs = [
    { id: "profile",  label: "Profile",       icon: User    },
    { id: "password", label: "Password",       icon: Key     },
    { id: "notifs",   label: "Notifications",  icon: Bell    },
    ...(canManageCompany ? [{ id: "company", label: "Company", icon: Building }] : []),
    { id: "security", label: "Security",       icon: Shield  },
  ];

  return (
    <div className="flex gap-5 flex-col lg:flex-row">
      <div className="lg:w-44 shrink-0">
        <Card className="overflow-hidden">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left border-b border-slate-100 last:border-0 transition-colors"
              style={tab === t.id ? { background: B.darkLight, color: B.dark, fontWeight: 600 } : { color: B.dark }}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
          <button onClick={onLogout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm border-t border-slate-200 text-red-600 hover:bg-red-50">
            <LogOut size={14} />Sign out
          </button>
        </Card>
      </div>

      <div className="flex-1 min-w-0">
        {tab === "profile" && (
          <Card className="p-5">
            <STitle>Profile settings</STitle>
            <div className="flex items-center gap-4 mb-5 p-4 rounded-xl" style={{ background: B.darkLight }}>
              <Avatar name={prof.name} size={14} />
              <div>
                <div className="text-base font-semibold" style={{ color: B.dark }}>{prof.name}</div>
                <div className="text-sm text-slate-500">{currentUser.role} · {prof.dept}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Full name"   value={prof.name}  onChange={v => setProf({ ...prof, name: v })}  required Icon={User} />
              <TextInput label="Work email"  type="email" value={prof.email} onChange={v => setProf({ ...prof, email: v })} required Icon={Mail} />
              <TextInput label="Phone"       value={prof.phone} onChange={v => setProf({ ...prof, phone: v })} Icon={Phone} />
              <TextInput label="Job title"   value={prof.title} onChange={v => setProf({ ...prof, title: v })} />
              <TextInput label="Department"  value={prof.dept}  onChange={v => setProf({ ...prof, dept: v })} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Btn onClick={saveProfile}><Save size={14} />Save changes</Btn>
              {saved && <span className="text-sm text-emerald-600 flex items-center gap-1"><Check size={14} />Saved!</span>}
            </div>
          </Card>
        )}

        {tab === "password" && (
          <Card className="p-5">
            <STitle>Change password</STitle>
            <div className="max-w-sm space-y-4">
              <PwInput label="Current password"  value={pw.curr} onChange={v => setPw({ ...pw, curr: v })} />
              <div>
                <PwInput label="New password" value={pw.newp} onChange={v => setPw({ ...pw, newp: v })} />
                <PwStrength pw={pw.newp} />
              </div>
              <PwInput label="Confirm new password" value={pw.conf} onChange={v => setPw({ ...pw, conf: v })} />
              <ErrBox msg={pwErr} />
              <OkBox  msg={pwOk ? "Password changed successfully." : ""} />
              <Btn onClick={changePw}><Key size={14} />Change password</Btn>
            </div>
          </Card>
        )}

        {tab === "notifs" && (
          <Card className="p-5">
            <STitle>Notification preferences</STitle>
            <div className="space-y-3">
              {[
                { k: "leave",   l: "Leave approvals",   s: "When a leave request is approved or rejected" },
                { k: "payroll", l: "Payroll reminders",  s: "2 days before payroll is due" },
                { k: "ann",     l: "Announcements",      s: "New company-wide posts" },
                { k: "att",     l: "Attendance alerts",  s: "Late clock-in or anomaly detected" },
                { k: "weekly",  l: "Weekly digest",      s: "Summary email every Monday" },
              ].map(n => (
                <div key={n.k} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{n.l}</div>
                    <div className="text-xs text-slate-500">{n.s}</div>
                  </div>
                  <button onClick={() => setNotifs(p => ({ ...p, [n.k]: !p[n.k] }))} style={{ color: notifs[n.k] ? B.dark : "#cbd5e1" }}>
                    {notifs[n.k] ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "company" && canManageCompany && (
          <Card className="p-5">
            <STitle>Company settings</STitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Company name" value="Adforce Solutions" onChange={() => {}} Icon={Building} />
              <SelectInput label="Currency" value={company.currency} onChange={v => setCompany(c => ({ ...c, currency: v }))} options={[{ value: "PKR", label: "PKR — Pakistani Rupee" }, { value: "USD", label: "USD" }, { value: "AED", label: "AED" }]} />
              <TextInput label="Office start time" type="time" value={company.officeStart} onChange={v => setCompany(c => ({ ...c, officeStart: v }))} />
              <TextInput label="Late grace period (minutes)" type="number" value={String(company.graceMinutes)} onChange={v => setCompany(c => ({ ...c, graceMinutes: parseInt(v) || 0 }))} />
            </div>
            <div className="mt-3 p-3 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-800">
              Check-ins after {company.officeStart} + {company.graceMinutes} min grace are marked <b>Late</b> in attendance and payroll (Monday–Friday only).
            </div>
            <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: B.darkLight, color: B.dark }}>
              Working days: Monday to Friday · Weekend off: Saturday & Sunday · Annual leave: {DEFAULT_ANNUAL_LEAVE} days/year (2/month)
            </div>
            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: B.darkLight, color: B.dark }}>
              Plan: <b>Business</b> · {users.length} employee{users.length !== 1 ? "s" : ""} · Next billing Jul 1
            </div>
            <Btn className="mt-4"><Save size={14} />Save</Btn>
          </Card>
        )}

        {tab === "security" && (
          <Card className="p-5">
            <STitle>Security</STitle>
            <div className="space-y-3 mb-5">
              {[
                { l: "Two-factor authentication", s: "TOTP app or SMS verification", on: false },
                { l: "Session timeout (30 min)",  s: "Auto sign-out on inactivity",   on: true  },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
                  <div><div className="text-sm font-medium text-slate-800">{s.l}</div><div className="text-xs text-slate-500">{s.s}</div></div>
                  {s.on ? <Pill tone="green"><Check size={12} />Active</Pill> : <Pill tone="slate">Off</Pill>}
                </div>
              ))}
            </div>
            <STitle>Recent activity</STitle>
            <div className="space-y-2">
              {[
                { a: "Sign in",          d: "Chrome · Lahore, PK", t: "Just now",   ok: true  },
                { a: "Password changed", d: "Chrome",              t: "Today",       ok: true  },
              ].map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg text-sm border border-slate-100">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="font-medium text-slate-800 flex-1">{a.a}</span>
                  <span className="text-slate-400 text-xs hidden sm:inline">{a.d}</span>
                  <span className="text-slate-400 text-xs">{a.t}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
