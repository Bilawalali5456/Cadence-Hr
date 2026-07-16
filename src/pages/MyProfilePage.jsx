import React, { useState } from "react";
import { Key, Phone } from "lucide-react";
import { B } from "../brand.jsx";
import { DEFAULT_ANNUAL_LEAVE, getUserCnic } from "../utils.js";
import { Avatar, Card, STitle, PwInput, PwStrength, Btn, ErrBox, OkBox } from "../components/ui.jsx";

export function MyProfilePage({ currentUser, users, setUsers, onLogout }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  const [tab, setTab] = useState("info");
  const [pw, setPw]   = useState({ curr: "", newp: "", conf: "" });
  const [pwErr, setPwErr] = useState(""); const [pwOk, setPwOk] = useState(false);

  function changePw() {
    setPwErr(""); setPwOk(false);
    if (me.password !== pw.curr)      { setPwErr("Current password is incorrect."); return; }
    if (pw.newp.length < 8)           { setPwErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw.newp))       { setPwErr("Must include an uppercase letter."); return; }
    if (!/\d/.test(pw.newp))          { setPwErr("Must include a number."); return; }
    if (pw.newp !== pw.conf)          { setPwErr("Passwords do not match."); return; }
    setUsers(us => us.map(u => u.id === me.id ? { ...u, password: pw.newp } : u));
    setPwOk(true); setPw({ curr: "", newp: "", conf: "" });
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-6 p-5 rounded-xl text-white" style={{ background: B.dark }}>
        <Avatar name={me.name} size={14} />
        <div>
          <div className="text-lg font-bold">{me.name}</div>
          <div className="text-sm opacity-70">{me.title || me.role} · {me.dept}</div>
          <div className="text-xs opacity-50 mt-0.5">{me.email}</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {[{ id: "info", label: "My info" }, { id: "password", label: "Change password" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm border-b-2 -mb-px"
            style={tab === t.id ? { borderColor: B.dark, color: B.dark, fontWeight: 600 } : { borderColor: "transparent", color: "#64748b" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="space-y-4">
          <Card className="p-5">
            <STitle>My information</STitle>
            <div className="space-y-3">
              {[["Full name", me.name], ["Email", me.email], ["Phone", me.phone || "—"], ["CNIC", getUserCnic(me) || "—"], ["Role", me.role], ["Department", me.dept || "—"], ["Team", me.team || "—"], ["Employment type", me.type], ["Hire date", me.hired || "—"], ["Marital status", me.maritalStatus || "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-400 text-sm">{k}</span>
                  <span className="font-medium text-sm text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <STitle>Emergency contact</STitle>
            <div className="space-y-3">
              {[["Guardian name", me.guardianName || "—"], ["Contact name", me.emergencyContactName || "—"], ["Contact number", me.emergencyContactPhone || "—"], ["Relationship", me.emergencyContactRelation || "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-400 text-sm">{k}</span>
                  <span className="font-medium text-sm text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <STitle>Leave balances</STitle>
            <div className="space-y-3">
              {[["Annual leave balance", `${me.leaveBalance ?? DEFAULT_ANNUAL_LEAVE} of ${DEFAULT_ANNUAL_LEAVE} days`]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-400 text-sm">{k}</span>
                  <span className="font-medium text-sm text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4">To update your information, contact your HR administrator.</p>
          </Card>
        </div>
      )}

      {tab === "password" && (
        <Card className="p-5">
          <STitle>Change password</STitle>
          <div className="space-y-4">
            <PwInput label="Current password"      value={pw.curr} onChange={v => setPw({ ...pw, curr: v })} />
            <div>
              <PwInput label="New password"         value={pw.newp} onChange={v => setPw({ ...pw, newp: v })} />
              <PwStrength pw={pw.newp} />
            </div>
            <PwInput label="Confirm new password"  value={pw.conf} onChange={v => setPw({ ...pw, conf: v })} />
            <ErrBox msg={pwErr} />
            <OkBox  msg={pwOk ? "Password changed successfully." : ""} />
            <Btn onClick={changePw}><Key size={14} />Change password</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
