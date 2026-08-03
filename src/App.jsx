import React, { useState, useRef, useEffect } from "react";
import { Users, Clock, Plane, Wallet, Briefcase, Megaphone, LayoutDashboard, Settings, AlertTriangle, Timer, LogOut, User, ChevronDown, RefreshCw, FileText, Package, Calendar, BarChart3, Fingerprint } from "lucide-react";
import { B, AdforceLogo } from "./brand.jsx";
import { SESSION_STORAGE_KEY, HOLIDAYS_STORAGE_KEY, apiBootstrap, apiFetchNotifications, apiFetchUsers, apiFetchAttendance, apiFetchLeave, apiFetchShortLeave, apiFetchPayroll, apiFetchHolidays, apiFetchPolicies, apiFetchAssets, apiFetchAnnouncements, apiFetchWarnings, apiFetchCompany, apiFetchBadges, apiMarkBadgeSeen, loadSession, loadHolidays, sanitizeHolidays, sanitizeAttendance, sanitizeLeaveRequests, sanitizeShortLeaveRequests, sanitizeAnnouncements, sanitizeNotifications, sanitizeWarnings, persistSessionToken } from "./api.js";
import { DEFAULT_COMPANY, can, isStaffRole, isHrAdminRole, isHrEmployeeRole, isExecutiveRole, hasOwnAttendance, hasAdminPortalAccess, applyAutoCheckouts, monthKey } from "./utils.js";
import { Avatar, Btn } from "./components/ui.jsx";
import { NotificationBell } from "./components/NotificationBell.jsx";
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
import { HolidaysPage } from "./pages/HolidaysPage.jsx";
import { ReportsPage } from "./pages/ReportsPage.jsx";
import { BiometricPage } from "./pages/BiometricPage.jsx";

const NAV = [
  { id: "home",          label: "Home",          icon: LayoutDashboard, permission: "view_dashboard" },
  { id: "people",        label: "People",         icon: Users,           permission: "view_people" },
  { id: "executives",    label: "Executives",     icon: Briefcase,       permission: "manage_executives" },
  { id: "attendance",    label: "Attendance",     icon: Clock,           permission: "view_attendance" },
  { id: "shortleave",    label: "Short Leave",    icon: Timer,           permission: "view_leave" },
  { id: "payroll",       label: "Payroll",        icon: Wallet,          permission: "view_payroll" },
  { id: "leave",         label: "Leave",          icon: Plane,           permission: "view_leave" },
  { id: "reports",       label: "Reports",        icon: BarChart3,       roles: ["HR Admin", "HR Employee", "Executive"] },
  { id: "biometric",     label: "Biometric",      icon: Fingerprint,     roles: ["HR Admin", "HR Employee", "Executive"] },
  { id: "holidays",      label: "Holidays",       icon: Calendar,        permission: null },
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
  reports:       ["Reports",         "Analytics and workforce insights"],
  biometric:     ["Biometric",       "ZKTeco device sync and PIN mapping"],
  holidays:      ["Holidays",        "Company holidays calendar"],
  policies:      ["Company Policies","Latest HR policies by category"],
  assets:        ["Company Assets",  "Equipment assignment and tracking"],
  announcements: ["Announcements",   "Company-wide posts"],
  myprofile:     ["My Profile",      "Your information and password"],
  settings:      ["Settings",        "Account, security, preferences"],
};

/** Sidebar route id → badge response key (omit Home, Reports, Profile, Settings, Executives) */
const TAB_BADGE_MAP = {
  leave: "leave",
  shortleave: "shortLeave",
  attendance: "attendance",
  announcements: "announcements",
  policies: "policies",
  payroll: "payroll",
  assets: "assets",
  holidays: "holidays",
};

function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center shrink-0">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function App() {
  const [users,         setUsers]         = useState([]);
  const [attendance,    setAttendance]    = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shortLeaveRequests, setShortLeaveRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [payroll,       setPayroll]       = useState([]);
  const [policies,      setPolicies]      = useState([]);
  const [assets,        setAssets]        = useState([]);
  const [holidays,      setHolidays]      = useState(() => sanitizeHolidays(loadHolidays()));
  const [notifications, setNotifications] = useState([]);
  const [warnings,      setWarnings]      = useState([]);
  const [roles,         setRoles]         = useState([]);
  const [company,       setCompany]       = useState(DEFAULT_COMPANY);
  const [session,       setSession]       = useState(() => {
    const s = loadSession();
    // Old sessions without a token look "logged in" but every API returns 401
    if (s && !s.token) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return s;
  });
  const [route,         setRoute]         = useState("home");
  const [roleMenu,      setRoleMenu]      = useState(false);
  const [dbStatus,      setDbStatus]      = useState("loading"); // loading | ready | error
  const [syncBanner,    setSyncBanner]    = useState(null);
  const [badges,        setBadges]        = useState({});
  const loadedRef = useRef(false);
  const ignoreSyncUntilRef = useRef(0);
  const refreshInFlightRef = useRef(null);

  function markRemoteApply() {
    ignoreSyncUntilRef.current = Date.now() + 800;
  }

  function canFetchUserRoster(role) {
    return hasAdminPortalAccess(role);
  }

  /** Refresh only the collections needed for the active tab (no full page reload). */
  async function refreshModule(routeId, roleHint = null) {
    const key = routeId || "home";
    if (refreshInFlightRef.current === key) return;
    refreshInFlightRef.current = key;
    const rosterOk = canFetchUserRoster(roleHint);
    try {
      markRemoteApply();
      if (key === "home" || key === "reports" || key === "biometric") {
        const [att, leave, shortLeave, warnings] = await Promise.all([
          apiFetchAttendance({ month: monthKey() }),
          apiFetchLeave(),
          apiFetchShortLeave(),
          apiFetchWarnings(),
        ]);
        markRemoteApply();
        setAttendance(att);
        setLeaveRequests(leave);
        setShortLeaveRequests(shortLeave);
        setWarnings(warnings);
      }
      if (key === "attendance") {
        // AttendancePage owns date/month-scoped fetches — never overwrite with current-month data
        const [leave, shortLeave, warnings] = await Promise.all([
          apiFetchLeave(),
          apiFetchShortLeave(),
          apiFetchWarnings(),
        ]);
        markRemoteApply();
        setLeaveRequests(leave);
        setShortLeaveRequests(shortLeave);
        setWarnings(warnings);
      }
      if (key === "people" || key === "executives") {
        if (rosterOk) {
          const [us, warnings] = await Promise.all([apiFetchUsers(), apiFetchWarnings()]);
          markRemoteApply();
          setUsers(us);
          setWarnings(warnings);
        }
      }
      if (key === "settings" || key === "myprofile") {
        // Employees/Managers: self profile only — never GET /api/users (403).
        const [us, warnings] = await Promise.all([
          apiFetchUsers({ selfOnly: !rosterOk }),
          apiFetchWarnings(),
        ]);
        markRemoteApply();
        setUsers(us);
        setWarnings(warnings);
      }
      if (key === "shortleave") {
        const [shortLeave, att] = await Promise.all([apiFetchShortLeave(), apiFetchAttendance({ month: monthKey() })]);
        markRemoteApply();
        setShortLeaveRequests(shortLeave);
        setAttendance(att);
      }
      if (key === "leave") {
        const leave = await apiFetchLeave();
        markRemoteApply();
        setLeaveRequests(leave);
      }
      if (key === "payroll") {
        const [pay, companyData, att] = await Promise.all([
          apiFetchPayroll(),
          apiFetchCompany(),
          apiFetchAttendance({ month: monthKey() }),
        ]);
        markRemoteApply();
        setPayroll(pay);
        setCompany(c => ({ ...DEFAULT_COMPANY, ...c, ...companyData }));
        setAttendance(att);
      }
      if (key === "holidays") {
        const list = await apiFetchHolidays();
        markRemoteApply();
        setHolidays(list);
      }
      if (key === "policies") {
        const list = await apiFetchPolicies();
        markRemoteApply();
        setPolicies(list);
      }
      if (key === "assets") {
        const list = await apiFetchAssets();
        markRemoteApply();
        setAssets(list);
      }
      if (key === "announcements") {
        const list = await apiFetchAnnouncements();
        markRemoteApply();
        setAnnouncements(list);
      }
      if (key === "biometric" && rosterOk) {
        const us = await apiFetchUsers();
        markRemoteApply();
        setUsers(us);
      }
    } catch (e) {
      console.error(`Module refresh failed (${key}):`, e);
    } finally {
      if (refreshInFlightRef.current === key) refreshInFlightRef.current = null;
    }
  }

  /* ── Load shell from bootstrap, then hydrate active module ── */
  useEffect(() => {
    apiBootstrap()
      .then(async d => {
        markRemoteApply();
        setCompany({ ...DEFAULT_COMPANY, ...(d.company || {}) });
        setRoles(d.roles || []);
        setHolidays(sanitizeHolidays(d.holidays ?? loadHolidays()));
        setUsers(d.currentUser ? [d.currentUser] : []);
        loadedRef.current = true;
        setDbStatus("ready");
        const s = loadSession();
        if (s?.token) {
          try {
            const rosterOk = canFetchUserRoster(d.currentUser?.role);
            const [us, notifs] = await Promise.all([
              // Employees/Managers: never hit GET /api/users (403 in console).
              rosterOk ? apiFetchUsers() : apiFetchUsers({ selfOnly: true }),
              apiFetchNotifications(),
            ]);
            markRemoteApply();
            setUsers(us);
            setNotifications(sanitizeNotifications(notifs));
          } catch (e) {
            console.error("Post-bootstrap hydrate failed:", e);
          }
          await refreshModule("home", d.currentUser?.role);
        }
      })
      .catch(e => {
        console.error("Database connection failed:", e);
        setDbStatus("error");
      });
  }, []);

  /* ── On tab change (and after DB ready): fetch that module's APIs ── */
  useEffect(() => {
    if (dbStatus !== "ready" || !session?.token) return;
    const roleHint = users.find(u => u.id === session.userId)?.role || null;
    refreshModule(route, roleHint);
  }, [route, session?.token, dbStatus]);

  /* ── Live poll while Attendance / Biometric / Home tab is open ── */
  useEffect(() => {
    if (dbStatus !== "ready" || !session?.token) return;
    if (route !== "attendance" && route !== "biometric" && route !== "home") return;
    const roleHint = users.find(u => u.id === session.userId)?.role || null;
    const id = setInterval(() => {
      refreshModule(
        route === "biometric" ? "biometric" : route === "home" ? "home" : "attendance",
        roleHint
      );
    }, 20000);
    return () => clearInterval(id);
  }, [route, session?.token, dbStatus, users]);

  /* ── Bulk sync disabled: all modules persist via granular REST endpoints ── */

  useEffect(() => {
    if (!loadedRef.current) return;
    const tick = () => {
      setAttendance(prev => {
        const next = applyAutoCheckouts(prev, users, holidays);
        return next === prev ? prev : next;
      });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [users, holidays]);

  useEffect(() => {
    if (!loadedRef.current || !session?.userId) return;
    const id = setInterval(() => {
      apiFetchNotifications()
        .then(list => {
          if (Array.isArray(list)) {
            markRemoteApply();
            setNotifications(sanitizeNotifications(list));
          }
        })
        .catch(e => console.error("Notification refresh failed:", e));
    }, 30000);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!session?.token) {
      setBadges({});
      return;
    }
    let cancelled = false;
    async function fetchBadges() {
      try {
        const data = await apiFetchBadges();
        if (!cancelled && data && typeof data === "object") setBadges(data);
      } catch {
        /* ignore poll errors */
      }
    }
    fetchBadges();
    const id = setInterval(fetchBadges, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session?.token]);

  /* ── Session stays in browser localStorage (never persist temporary passwords) ── */
  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId: session.userId, token: session.token }));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [session]);

  useEffect(() => {
    if (loadedRef.current) localStorage.setItem(HOLIDAYS_STORAGE_KEY, JSON.stringify(sanitizeHolidays(holidays)));
  }, [holidays]);

  const currentUser = session ? users.find(u => u.id === session.userId) : null;

  function handleLogin(u, loginPassword) {
    const nextSession = {
      userId: u.id,
      token: u.sessionToken,
      pendingTempPassword: u.firstLogin ? loginPassword : undefined,
    };
    // Persist token immediately so authHeaders() sees it before React effects run
    persistSessionToken(nextSession.userId, nextSession.token);
    setSession(nextSession);
    // Merge login user into local users list (password fields never included)
    setUsers(us => {
      const { password, tempPassword, sessionToken, ...safe } = u;
      const idx = us.findIndex(x => x.id === u.id);
      if (idx >= 0) {
        const next = [...us];
        next[idx] = { ...next[idx], ...safe };
        return next;
      }
      return [...us, safe];
    });
    setRoute("home");
  }
  function handleLogout()  { setSession(null); setRoute("home"); setRoleMenu(false); setBadges({}); }
  function handleNavClick(tabId) {
    setRoute(tabId);
    const badgeKey = TAB_BADGE_MAP[tabId];
    if (!badgeKey) return;
    setBadges(prev => ({ ...prev, [badgeKey]: 0 }));
    apiMarkBadgeSeen(tabId).catch(() => {});
  }
  function handleFirstLoginDone() {
    setSession(s => (s ? { userId: s.userId, token: s.token } : null));
    setUsers(us => us.map(u => u.id === session.userId ? { ...u, firstLogin: false, tempPassword: undefined, password: undefined } : u));
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

  if (!session?.token || !currentUser) return <LoginPage onLogin={handleLogin} />;
  if (currentUser.firstLogin) {
    return (
      <ForcePasswordChange
        userId={currentUser.id}
        currentPassword={session.pendingTempPassword || ""}
        onDone={handleFirstLoginDone}
      />
    );
  }

  const role = currentUser.role;
  const rosterUsers = canFetchUserRoster(role) ? users : [];
  const nav  = NAV.filter(n => {
    if (n.roles) return n.roles.includes(role);
    if (n.id === "myprofile") return hasOwnAttendance(role) || isStaffRole(role);
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
            <button key={n.id} onClick={() => handleNavClick(n.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={route === n.id
                ? { background: "rgba(255,255,255,0.15)", color: B.white, fontWeight: 600 }
                : { color: "rgba(255,255,255,0.6)" }}>
              <n.icon size={16} className="shrink-0" />
              <span className="hidden lg:inline flex-1 text-left">{n.label}</span>
              <NavBadge count={badges[TAB_BADGE_MAP[n.id]] || 0} />
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
          <NotificationBell
            currentUser={currentUser}
            notifications={notifications}
            setNotifications={setNotifications}
            setRoute={setRoute}
          />
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
          {syncBanner && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{syncBanner}</span>
              <button type="button" className="text-xs font-medium underline" onClick={() => setSyncBanner(null)}>Dismiss</button>
            </div>
          )}
          <div className="mb-5">
            <h1 className="text-xl font-bold" style={{ color: B.dark }}>{title}</h1>
            <p className="text-sm text-slate-400">{sub}</p>
          </div>
          {route === "home"          && <Dashboard      currentUser={currentUser} users={users} setRoute={setRoute} attendance={attendance} setAttendance={setAttendance} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} setUsers={setUsers} roles={roles} holidays={holidays} notifications={notifications} setNotifications={setNotifications} warnings={warnings} setWarnings={setWarnings} />}
          {route === "people"        && <PeoplePage     users={users} setUsers={setUsers} currentUser={currentUser} attendance={attendance} setAttendance={setAttendance} payroll={payroll} setPayroll={setPayroll} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} roles={roles} holidays={holidays} assets={assets} setAssets={setAssets} notifications={notifications} setNotifications={setNotifications} warnings={warnings} setWarnings={setWarnings} />}
          {route === "executives"    && <ExecutivesPage users={users} setUsers={setUsers} attendance={attendance} setAttendance={setAttendance} payroll={payroll} setPayroll={setPayroll} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} assets={assets} setAssets={setAssets} notifications={notifications} setNotifications={setNotifications} warnings={warnings} setWarnings={setWarnings} />}
          {route === "attendance"    && <AttendancePage currentUser={currentUser} users={users} attendance={attendance} setAttendance={setAttendance} shortLeaveRequests={shortLeaveRequests} setShortLeaveRequests={setShortLeaveRequests} leaveRequests={leaveRequests} setLeaveRequests={setLeaveRequests} setUsers={setUsers} roles={roles} holidays={holidays} notifications={notifications} setNotifications={setNotifications} />}
          {route === "shortleave"    && <ShortLeavePage currentUser={currentUser} requests={shortLeaveRequests} setRequests={setShortLeaveRequests} users={users} attendance={attendance} setAttendance={setAttendance} roles={roles} />}
          {route === "payroll"       && <PayrollPage    currentUser={currentUser} users={users} attendance={attendance} payroll={payroll} setPayroll={setPayroll} company={company} roles={roles} leaveRequests={leaveRequests} holidays={holidays} />}
          {route === "leave"         && <LeavePage      currentUser={currentUser} requests={leaveRequests} setRequests={setLeaveRequests} users={users} setUsers={setUsers} roles={roles} notifications={notifications} setNotifications={setNotifications} />}
          {route === "reports"       && <ReportsPage    users={users} attendance={attendance} leaveRequests={leaveRequests} payroll={payroll} holidays={holidays} />}
          {route === "biometric"     && <BiometricPage  currentUser={currentUser} users={users} setAttendance={(next) => { markRemoteApply(); setAttendance(next); }} />}
          {route === "holidays"      && <HolidaysPage   currentUser={currentUser} holidays={holidays} setHolidays={setHolidays} />}
          {route === "policies"      && <PoliciesPage   currentUser={currentUser} policies={policies} setPolicies={setPolicies} roles={roles} users={rosterUsers} notifications={notifications} setNotifications={setNotifications} />}
          {route === "assets"        && <AssetsPage     currentUser={currentUser} users={users} assets={assets} setAssets={setAssets} roles={roles} />}
          {route === "announcements" && <AnnouncementsPage currentUser={currentUser} anns={announcements} setAnns={setAnnouncements} roles={roles} users={rosterUsers} notifications={notifications} setNotifications={setNotifications} />}
          {route === "myprofile"     && <MyProfilePage  currentUser={currentUser} users={users} setUsers={setUsers} onLogout={handleLogout} warnings={warnings} setWarnings={setWarnings} />}
          {route === "settings"      && <SettingsPage   currentUser={currentUser} users={users} setUsers={setUsers} onLogout={handleLogout} company={company} setCompany={setCompany} roles={roles} />}
        </main>
      </div>
    </div>
  );
}
