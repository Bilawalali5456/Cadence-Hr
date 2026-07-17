import React, { useState } from "react";
import { Key, Check, AlertTriangle } from "lucide-react";
import { B } from "../brand.jsx";
import { DEFAULT_ANNUAL_LEAVE, getUserCnic, formatDate } from "../utils.js";
import { apiChangePassword } from "../api.js";
import { Avatar, Card, STitle, PwInput, PwStrength, Btn, ErrBox, OkBox, Pill } from "../components/ui.jsx";
import { warningTypeLabel, warningTypeTone } from "../components/IssueWarningModal.jsx";

export function MyProfilePage({ currentUser, users, setUsers, onLogout, warnings = [], setWarnings }) {
  const me = users.find(u => u.id === currentUser.id) || currentUser;
  const [tab, setTab] = useState("info");
  const [pw, setPw]   = useState({ curr: "", newp: "", conf: "" });
  const [pwErr, setPwErr] = useState(""); const [pwOk, setPwOk] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const myWarnings = (warnings || [])
    .filter(w => w && w.userId === me.id)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  async function changePw() {
    setPwErr(""); setPwOk(false);
    if (!pw.curr)                     { setPwErr("Current password is required."); return; }
    if (pw.newp.length < 8)           { setPwErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw.newp))       { setPwErr("Must include an uppercase letter."); return; }
    if (!/\d/.test(pw.newp))          { setPwErr("Must include a number."); return; }
    if (pw.newp !== pw.conf)          { setPwErr("Passwords do not match."); return; }

    setPwLoading(true);
    try {
      const data = await apiChangePassword({
        userId: me.id,
        currentPassword: pw.curr,
        newPassword: pw.newp,
      });
      if (!data.ok) {
        setPwErr(data.error || "Failed to change password.");
        return;
      }
      setUsers(us => us.map(u => u.id === me.id
        ? { ...u, password: undefined, tempPassword: undefined, firstLogin: false }
        : u));
      setPwOk(true);
      setPw({ curr: "", newp: "", conf: "" });
    } catch (e) {
      setPwErr(e.message || "Failed to change password.");
    } finally {
      setPwLoading(false);
    }
  }

  function acknowledgeWarning(id) {
    if (!setWarnings) return;
    setWarnings(prev => (prev || []).map(w =>
      w && w.id === id ? { ...w, acknowledged: true } : w
    ));
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
        {[
          { id: "info", label: "My info" },
          { id: "warnings", label: `Warnings (${myWarnings.length})` },
          { id: "password", label: "Change password" },
        ].map(t => (
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

      {tab === "warnings" && (
        <Card className="p-5">
          <STitle>My warnings</STitle>
          {myWarnings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No warnings</p>
          ) : (
            <div className="space-y-3">
              {myWarnings.map(w => (
                <div key={w.id} className="p-3 rounded-lg border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Pill tone={warningTypeTone(w.type)}>{warningTypeLabel(w.type)}</Pill>
                    <span className="text-xs text-slate-400">{formatDate(w.date)}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{w.reason}</p>
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-slate-400">
                    <span>Issued by {w.issuedBy || "—"}</span>
                    {w.acknowledged ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <Check size={14} />Acknowledged
                      </span>
                    ) : (
                      <Btn size="sm" onClick={() => acknowledgeWarning(w.id)}>
                        <AlertTriangle size={13} />Acknowledge
                      </Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
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
            <Btn onClick={changePw} disabled={pwLoading}><Key size={14} />{pwLoading ? "Saving…" : "Change password"}</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
