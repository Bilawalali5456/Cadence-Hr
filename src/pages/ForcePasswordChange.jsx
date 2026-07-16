import React, { useState } from "react";
import { Save, KeyRound } from "lucide-react";
import { B } from "../brand.jsx";
import { PwInput, PwStrength, Btn, ErrBox } from "../components/ui.jsx";

export function ForcePasswordChange({ onDone }) {
  const [pw, setPw]     = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr]   = useState("");

  function save() {
    setErr("");
    if (pw.length < 8)         { setErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw))     { setErr("Password must contain at least one uppercase letter."); return; }
    if (!/\d/.test(pw))        { setErr("Password must contain at least one number."); return; }
    if (pw !== conf)            { setErr("Passwords do not match."); return; }
    onDone(pw);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: B.red }}>
            <KeyRound size={20} color="white" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: B.dark }}>Set your password</h2>
            <p className="text-xs text-slate-500">First login — please create a new password</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-6 mt-3">
          You were logged in with a temporary password. Set your permanent password to continue.
        </p>
        <div className="space-y-4">
          <div>
            <PwInput label="New password" value={pw} onChange={setPw} />
            <PwStrength pw={pw} />
          </div>
          <PwInput label="Confirm password" value={conf} onChange={setConf} />
          <ErrBox msg={err} />
          <Btn onClick={save} className="w-full justify-center"><Save size={14} />Save password</Btn>
        </div>
      </div>
    </div>
  );
}
