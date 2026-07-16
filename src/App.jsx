import React, { useState, useRef, useEffect } from "react";
import { Users, Clock, Plane, Wallet, Briefcase, Megaphone, LayoutDashboard, Settings, AlertTriangle, Timer, LogOut, User, ChevronDown, RefreshCw, FileText, Package } from "lucide-react";
import { B, AdforceLogo } from "./brand.jsx";
import { SESSION_STORAGE_KEY, apiBootstrap, apiSave, loadSession } from "./api.js";
import { DEFAULT_COMPANY, can, isStaffRole, applyAutoCheckouts } from "./utils.js";
import { Avatar, Btn } from "./components/ui.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ForcePasswordChange } from "./pages/ForcePasswordChange.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { PeoplePage } from "./pages/PeoplePage.jsx";
import { AttendancePage } from "./pages/AttendancePage.jsx";
import { ShortLeavePage } from "./pages/ShortLeavePage.jsx";
import { PayrollPage } from "./pages/PayrollPage.jsx";
import { LeavePage } from "./pages/LeavePage.jsx";
import { AnnouncementsPage } from "./pages/AnnouncementsPage.jsx";
import { MyProfilePage } from "./pages/MyProfilePage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { ExecutivesPage } from "./pages/ExecutivesPage.jsx";
import { PoliciesPage } from "./pages/PoliciesPage.jsx";
import { AssetsPage } from "./pages/AssetsPage.jsx";

const NAV = [
  { id: "home",          label: "Home",          icon: LayoutDashboard, permission: "view_dashboard" },
  { id: "people",        label: "People",         icon: Users,           permission: "view_people" },
  { id: "executives",    label: "Executives",     icon: Briefcase,       permission: "manage_executives" },
  { id: "attendance",    label: "Attendance",     icon: Clock,           permission: "view_attendance" },
  { id: "shortleave",    label: "Short Leave",    icon: Timer,           permission: "view_leave" },
  { id: "payroll",       label: "Payroll",        icon: Wallet,          permission: "view_payroll" },
  { id: "leave",         label: "Leave",          icon: Plane,           permission: "view_leave" },
  { id: "policies",      label: "Policies",       icon: FileText,        permission: "view_policies" },
  { id: "assets",        label: "Assets",         icon: Package,         permission: "view_assets" },
  { id: "announcements", label: "Announcements",  icon: Megaphone,       permission: "view_announcements" },
  { id: "myprofile",     label: "My Profile",     icon: User,            permission: null },
  { id: "settings",      label: "Settings",       icon: Settings,        permission: null },
];

const TITLES = {
  home:          ["Home",            "Adforce Solutions HR Portal"],
  payroll:       ["Payroll",         "Salary slips and payments"],
  people:        ["People",          "Employees, access & bank details"],
  executives:    ["Executives",      "Manage executive accounts & access"],
  attendance:    ["Attendance",      "Shift check-in, breaks & reports"],
  shortleave:    ["Short Leave",     "Partial-day leave requests"],
  leave:         ["Leave",           "Requests and approvals"],
  policies:      ["Company Policies","Latest HR policies by category"],
  assets:        ["Company Assets",  "Equipment assignment and tracking"],
  announcements: ["Announcements",   "Company-wide posts"],
  myprofile:     ["My Profile",      "Your information and password"],
  settings:      ["Settings",        "Account, security, preferences"],
};

export default function App() {
  const [users,         setUsers]         = useState([]);
  const [attendance,    setAttendance]    = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shortLeaveRequests, setShortLeaveRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [payroll,       setPayroll]       = useState([]);
  const [policies,      setPolicies]      = useState([]);
  const [assets,        setAssets]        = useState([]);
  const [roles,         setRoles]         = useState([]);
  const [company,       setCompany]       = useState(DEFAULT_COMPANY);
  const [session,       setSession]       = useState(loadSession);
  const [route,         setRoute]         = useState("home");
  const [roleMenu,      setRoleMenu]      = useState(false);
  const [dbStatus,      setDbStatus]      = useState("loading"); // loading | ready | error
  const loadedRef = useRef(false);

  /* ── Load everything from PostgreSQL on startup ── */
  useEffect(() => {
    apiBootstrap()
      .then(d => {
        setUsers(d.users || []);
        setAttendance(d.attendance || []);
        setLeaveRequests(d.leave || []);
        setShortLeaveRequests(d.shortLeave || []);
        setAnnouncements(d.announcements || []);
        setPayroll(d.payroll || []);
        setPolicies(d.policies || []);
        setAssets(d.assets || []);
        setRoles(d.roles || []);
        setCompany({ ...DEFAULT_COMPANY, ...(d.company || {}) });
        loadedRef.current = true;
        setDbStatus("ready");
      })
      .catch(e => {
        console.error("Database connection failed:", e);
        setDbStatus("error");
      });
  }, []);

  /* ── Sync each collection to PostgreSQL when it changes ── */
  useEffect(() => { if (loadedRef.current) apiSave("users", users); }, [users]);
  useEffect(() => { if (loadedRef.current) apiSave("attendance", attendance); }, [attendance]);
  useEffect(() => { if (loadedRef.current) apiSave("leave", leaveRequests); }, [leaveRequests]);
  useEffect(() => { if (loadedRef.current) apiSave("short-leave", shortLeaveRequests); }, [shortLeaveRequests]);
  useEffect(() => { if (loadedRef.current) apiSave("announcements", announcements); }, [announcements]);
  useEffect(() => { if (loadedRef.current) apiSave("payroll", payroll); }, [payroll]);
  useEffect(() => { if (loadedRef.current) apiSave("policies", policies); }, [policies]);
  useEffect(() => { if (loadedRef.current) apiSave("assets", assets); }, [assets]);
  useEffect(() => { if (loadedRef.current) apiSave("company", company); }, [company]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const tick = () => {
      setAttendance(prev => {
        const next = applyAutoCheckouts(prev, users);
        return next === prev ? prev : next;
      });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [users]);

  /* ── Session stays in browser localStorage ── */
  useEffect(() => {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [session]);

  const currentUser = session ? users.find(u => u.id === session.userId) : null;

  function handleLogin(u)  { setSession({ userId: u.id }); setRoute("home"); }
  function handleLogout()  { setSession(null); setRoute("home"); setRoleMenu(false); }
  function handleFirstLoginDone(newPw) {
    setUsers(us => us.map(u => u.id === session.userId ? { ...u, password: newPw, firstLogin: false, tempPassword: undefined } : u));
  }

  /* ── Database status screens ── */
  if (dbStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: B.dark }}>
        <div className="text-center">
          <AdforceLogo boxWidth={200} boxHeight={80} align="center" className="mx-auto" />
          <div className="mt-6 flex items-center justify-center gap-2 text-white/70 text-sm">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Connecting to database...
          </div>
        </div>
      </div>
    );
  }

  if (dbStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.dark }}>
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: B.redLight }}>
              <AlertTriangle size={20} style={{ color: B.red }} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: B.dark }}>Cannot connect to database</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">The app could not reach the backend server. Make sure it is running:</p>
          <div className="p-4 rounded-lg bg-slate-900 text-emerald-400 text-xs font-mono space-y-1 mb-4">
            <div># In a separate terminal:</div>
            <div>cd server</div>
            <div>npm run dev</div>
          </div>
          <p className="text-xs text-slate-400 mb-4">Also check PostgreSQL is running (Windows Services → postgresql) and server/.env has the correct password.</p>
          <Btn onClick={() => window.location.reload()}><RefreshCw size={14} />Retry connection</Btn>
        </div>
      </div>
    );
  }

  if (!session || !currentUser) return <LoginPage users={users} onLogin={handleLogin} />;
  if (currentUser.firstLogin)   return <ForcePasswordChange onDone={handleFirstLoginDone} />;

  const role = currentUser.role;
  const nav  = NAV.filter(n => {
    if (n.id === "myprofile") return isStaffRole(role);
    if (!n.permission) return true;
    return can(role, n.permission, roles);
  });
  const [title, sub] = TITLES[route] || TITLES.home;

  return (
    <div className="min-h-screen bg-slate-50 flex" style={{ fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-16 lg:w-56 flex flex-col shrink-0 sticky top-0 h-screen" style={{ background: B.dark }}>
        <div className="h-14 px-3 flex items-center justify-center lg:justify-start border-b border-white/10 overflow-hidden shrink-0">
          <div className="hidden lg:block">
            <AdforceLogo boxWidth={176} boxHeight={36} />
          </div>
          <div className="block lg:hidden">
            <AdforceLogo boxWidth={48} boxHeight={28} />
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(n => (
            <button key={n.id} onClick={() => setRoute(n.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={route === n.id
                ? { background: "rgba(255,255,255,0.15)", color: B.white, fontWeight: 600 }
                : { color: "rgba(255,255,255,0.6)" }}>
              <n.icon size={16} className="shrink-0" />
              <span className="hidden lg:inline">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.6)" }}>
            <LogOut size={16} className="shrink-0" />
            <span className="hidden lg:inline">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-30">
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setRoleMenu(!roleMenu)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
              <Avatar name={currentUser.name} size={7} />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-medium text-slate-800 leading-tight">{currentUser.name}</div>
                <div className="text-xs text-slate-400 leading-tight">{role}</div>
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {roleMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50">
                <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-100">{currentUser.email}</div>
                <button onClick={() => { setRoute("settings"); setRoleMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2" style={{ color: B.dark }}>
                  <Settings size={14} />Settings
                </button>
                <button onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <LogOut size={14} />Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          <div className="mb-5">
            <h1 className="text-xl font-bold" style={{ color: B.dark }}>{title}</h1>
            <p className="text-sm text-slate-400">{sub}</p>
          </div>
          {route === "home"          && <Dashboard      currentUser={currentUser} users={users} setRoute={setRoute} attendance={attendance} setAttendance={setAttendance} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} setUsers={setUsers} roles={roles} />}
          {route === "people"        && <PeoplePage     users={users} setUsers={setUsers} currentUser={currentUser} attendance={attendance} setAttendance={setAttendance} payroll={payroll} setPayroll={setPayroll} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} roles={roles} />}
          {route === "executives"    && <ExecutivesPage users={users} setUsers={setUsers} />}
          {route === "attendance"    && <AttendancePage currentUser={currentUser} users={users} attendance={attendance} setAttendance={setAttendance} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} setUsers={setUsers} roles={roles} />}
          {route === "shortleave"    && <ShortLeavePage currentUser={currentUser} requests={shortLeaveRequests} setRequests={setShortLeaveRequests} users={users} attendance={attendance} setAttendance={setAttendance} roles={roles} />}
          {route === "payroll"       && <PayrollPage    currentUser={currentUser} users={users} attendance={attendance} payroll={payroll} setPayroll={setPayroll} company={company} roles={roles} leaveRequests={leaveRequests} />}
          {route === "leave"         && <LeavePage      currentUser={currentUser} requests={leaveRequests} setRequests={setLeaveRequests} users={users} setUsers={setUsers} roles={roles} />}
          {route === "policies"      && <PoliciesPage   currentUser={currentUser} policies={policies} setPolicies={setPolicies} roles={roles} />}
          {route === "assets"        && <AssetsPage     currentUser={currentUser} users={users} assets={assets} setAssets={setAssets} roles={roles} />}
          {route === "announcements" && <AnnouncementsPage currentUser={currentUser} anns={announcements} setAnns={setAnnouncements} roles={roles} />}
          {route === "myprofile"     && <MyProfilePage  currentUser={currentUser} users={users} setUsers={setUsers} onLogout={handleLogout} />}
          {route === "settings"      && <SettingsPage   currentUser={currentUser} users={users} setUsers={setUsers} onLogout={handleLogout} company={company} setCompany={setCompany} roles={roles} />}
        </main>
      </div>
    </div>
  );
}
