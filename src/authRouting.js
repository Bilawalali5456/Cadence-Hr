/** Map DB role names to dashboard URL paths. */
const ROLE_DASHBOARD = {
  "HR Admin": "/admin/dashboard",
  Executive: "/executive/dashboard",
  Employee: "/employee/dashboard",
};

export function dashboardPathForRole(role) {
  return ROLE_DASHBOARD[role] || "/employee/dashboard";
}

export function isLoginPath(pathname = window.location.pathname) {
  return pathname === "/login" || pathname === "/";
}

export function isDashboardPath(pathname = window.location.pathname) {
  return Object.values(ROLE_DASHBOARD).some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/** Navigate without full page reload (History API). */
export function navigateTo(path, { replace = false } = {}) {
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function redirectToRoleDashboard(role, { replace = false } = {}) {
  navigateTo(dashboardPathForRole(role), { replace });
}

export function redirectToLogin({ replace = false } = {}) {
  navigateTo("/login", { replace });
}
