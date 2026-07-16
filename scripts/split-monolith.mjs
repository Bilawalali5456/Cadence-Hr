import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "adforce-hr.jsx"), "utf8");
const lines = src.split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function toExports(code) {
  return code
    .replace(/^async function /gm, "export async function ")
    .replace(/^function /gm, "export function ")
    .replace(/^const ([A-Z_][A-Z0-9_]*) = /gm, "export const $1 = ");
}

const ALL_ICONS = [
  "Users", "Clock", "CalendarDays", "Plane", "Wallet", "Receipt", "Briefcase", "Megaphone",
  "LayoutDashboard", "Settings", "Search", "Bell", "ChevronRight", "Check", "X", "Sparkles",
  "AlertTriangle", "Send", "ShieldCheck", "ArrowRight", "UserPlus", "CircleDollarSign",
  "Activity", "BadgeCheck", "Timer", "Trash2", "Edit2", "Eye", "EyeOff", "Lock", "LogOut",
  "User", "Save", "Plus", "ChevronDown", "Key", "Shield", "Building", "Phone", "Mail", "Upload",
  "ToggleLeft", "ToggleRight", "AlertCircle", "RefreshCw", "KeyRound", "LogIn", "Landmark", "Coffee",
  "FileText", "Package", "ArrowLeft",
];

const UI_EXPORTS = [
  "Pill", "Avatar", "Card", "STitle", "Modal", "Field", "TextInput", "SelectInput",
  "PwInput", "PwStrength", "Btn", "ErrBox", "OkBox",
];

const BRAND_EXPORTS = ["B", "LOGO_SRC", "AdforceLogo"];

const API_EXPORTS = [
  "API_URL", "SESSION_STORAGE_KEY", "apiBootstrap", "apiSave", "apiSendCredentials", "loadSession",
];

const UTILS_NAMES = [
  "DEFAULT_COMPANY", "DEFAULT_SHIFT", "DEFAULT_ANNUAL_LEAVE", "LOGIN_ROLES", "SENSITIVE_ENC_KEY",
  "getRolePermissions", "can", "isStaffRole", "isHrAdminRole", "isExecutiveRole", "employeeRoster", "hrAdminRoster",
  "isHrAdminRequest", "canSelfSubmitLeave", "visibleShortLeaveRequests", "visibleLeaveRequests",
  "canApproveShortLeaveRequest", "canApproveLeaveRequest", "canManageHrAdmin", "canEditPerson", "canDeletePerson",
  "canResetPersonCredentials", "canDeleteLeaveRecord", "canDeleteShortLeaveRecord", "sortHrAdminFirst",
  "attendanceVisibleUserIds", "peopleRoster", "activeAttendanceRoster", "activePayrollRoster",
  "getUserShift", "shiftDateTime", "getShiftBounds", "formatShiftRange", "formatDurationMs",
  "calcTotalBreakMs", "calcShortLeaveMs", "calcNetWorkingMs", "isLateCheckIn", "computeDayStatus",
  "resolveDayStatus", "dayStatusPill", "finalizeRecord", "canCheckIn", "canCheckOut",
  "performCheckIn", "performCheckOut", "performBreakStart", "performBreakEnd",
  "buildShortLeaveRequest", "applyApprovedShortLeave", "removeShortLeaveFromAttendance", "applyAutoCheckouts",
  "displayWorkingHours", "todayKey", "isWeekendDate", "enumerateWorkingDays", "countWorkingDaysInclusive",
  "leavePaidDays", "leaveUnpaidDays", "computeLeavePaySplit", "formatTime", "formatDate", "hoursWorked",
  "getUserTodayRecord", "attendanceStatus", "weekStart", "filterAttendanceByPeriod", "findUserByCredentials",
  "genId", "genTempPw", "normalizeCnic", "formatCnic", "formatCnicInput", "isValidCnic",
  "encryptSensitive", "decryptSensitive", "getUserCnic", "cnicDigitsForUser",
  "loginRoleMatchesSelection", "monthKey", "monthLabel", "workingDaysInMonth", "presentDaysInMonth",
  "lateDaysInMonth", "leaveDaysInMonth",
];

function usedIcons(code) {
  return ALL_ICONS.filter((i) => new RegExp(`\\b${i}\\b`).test(code));
}

function usedFrom(list, code) {
  return list.filter((n) => new RegExp(`\\b${n}\\b`).test(code));
}

function makeImports(code, opts = {}) {
  const imports = [];
  const hooks = [];
  if (/\buseState\b/.test(code)) hooks.push("useState");
  if (/\buseRef\b/.test(code)) hooks.push("useRef");
  if (/\buseEffect\b/.test(code)) hooks.push("useEffect");
  const needsReact = hooks.length > 0 || /<[A-Za-z]/.test(code);
  if (needsReact) {
    if (hooks.length) imports.push(`import React, { ${hooks.join(", ")} } from "react";`);
    else imports.push(`import React from "react";`);
  }
  const icons = usedIcons(code);
  if (icons.length) {
    imports.push(`import { ${icons.join(", ")} } from "lucide-react";`);
  }
  if (!opts.skipBrand) {
    const brand = usedFrom(BRAND_EXPORTS, code);
    if (brand.length) {
      imports.push(`import { ${brand.join(", ")} } from "${opts.brandPath || "../brand.jsx"}";`);
    }
  }
  if (!opts.skipApi) {
    const api = usedFrom(API_EXPORTS, code);
    if (api.length) {
      imports.push(`import { ${api.join(", ")} } from "${opts.apiPath || "../api.js"}";`);
    }
  }
  if (!opts.skipUtils) {
    const utils = usedFrom(UTILS_NAMES, code);
    if (utils.length) {
      imports.push(`import { ${utils.join(", ")} } from "${opts.utilsPath || "../utils.js"}";`);
    }
  }
  if (!opts.skipUi) {
    const ui = usedFrom(UI_EXPORTS, code);
    if (ui.length) {
      imports.push(`import { ${ui.join(", ")} } from "${opts.uiPath || "../components/ui.jsx"}";`);
    }
  }
  for (const extra of opts.extraImports || []) imports.push(extra);
  return imports.join("\n") + (imports.length ? "\n\n" : "");
}

function writeFile(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const out = content.replace(/\n+$/, "") + "\n";
  fs.writeFileSync(p, out, "utf8");
  console.log("Wrote", rel, `(${out.split("\n").length} lines)`);
}

function writeModule(rel, body, opts = {}) {
  const code = opts.noExport ? body : toExports(body);
  writeFile(rel, makeImports(code, opts) + code);
}

const pageOpts = {
  brandPath: "../brand.jsx",
  utilsPath: "../utils.js",
  uiPath: "../components/ui.jsx",
  apiPath: "../api.js",
};

// Clean previous JSX rename leftovers
for (const stale of ["src/brand.js", "src/components/ui.js"]) {
  const p = path.join(ROOT, stale);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// --- api.js ---
writeModule("src/api.js", slice(25, 64), {
  skipBrand: true, skipApi: true, skipUtils: true, skipUi: true,
});

// --- brand.jsx ---
{
  const brandConst = "export const B = " + slice(13, 22).replace(/^const B = /, "");
  const logo = toExports(slice(723, 778));
  const code = brandConst + "\n\n" + logo;
  writeFile(
    "src/brand.jsx",
    makeImports(code, { skipBrand: true, skipApi: true, skipUtils: true, skipUi: true }) + code,
  );
}

// --- utils.js ---
{
  let utilsBody =
    slice(66, 720) + "\n\n" + slice(995, 1031) + "\n\n" + slice(4010, 4069);
  utilsBody = utilsBody.replace(/\n\/\* ─── ADFORCE LOGO ─── \*\/[\s\S]*$/, "");
  utilsBody = toExports(utilsBody);
  writeFile(
    "src/utils.js",
    makeImports(utilsBody, {
      skipApi: true, skipUtils: true, skipUi: true, brandPath: "./brand.jsx",
    }) + utilsBody,
  );
}

// --- ui.jsx ---
writeModule("src/components/ui.jsx", slice(781, 948), {
  skipApi: true, skipUtils: true, skipUi: true, brandPath: "../brand.jsx",
});

// --- EmployeeForm.jsx ---
writeModule("src/components/EmployeeForm.jsx", slice(1369, 1436), {
  brandPath: "../brand.jsx",
  utilsPath: "../utils.js",
  uiPath: "./ui.jsx",
  skipApi: true,
});

writeModule("src/pages/ForcePasswordChange.jsx", slice(951, 992), pageOpts);
writeModule("src/pages/LoginPage.jsx", slice(1033, 1183), pageOpts);
writeModule("src/pages/SettingsPage.jsx", slice(1186, 1366), pageOpts);

writeModule("src/pages/PeoplePage.jsx", slice(1438, 2062), {
  ...pageOpts,
  extraImports: [`import { EmployeeForm } from "../components/EmployeeForm.jsx";`],
});

writeModule("src/pages/MyProfilePage.jsx", slice(2065, 2160), pageOpts);

// Dashboard + HrAdminOversightPanel
{
  const code = toExports(slice(2163, 2527));
  writeFile("src/pages/Dashboard.jsx", makeImports(code, pageOpts) + code);
}

// Attendance helpers + page
{
  const code = toExports(slice(2530, 2963));
  writeFile(
    "src/pages/AttendancePage.jsx",
    makeImports(code, {
      ...pageOpts,
      extraImports: [`import { HrAdminOversightPanel } from "./Dashboard.jsx";`],
    }) + code,
  );
}

writeModule("src/pages/ShortLeavePage.jsx", slice(2966, 3105), pageOpts);
writeModule("src/pages/LeavePage.jsx", slice(3108, 3293), pageOpts);

// Executives includes EXECUTIVE_POSITIONS
writeModule("src/pages/ExecutivesPage.jsx", slice(3296, 3547), pageOpts);

writeModule("src/pages/AnnouncementsPage.jsx", slice(3550, 3606), pageOpts);

// Policies includes POLICY_CATEGORIES
writeModule("src/pages/PoliciesPage.jsx", slice(3609, 3777), pageOpts);

// Assets includes ASSET_TYPES / ASSET_CONDITIONS
writeModule("src/pages/AssetsPage.jsx", slice(3780, 4007), pageOpts);

writeModule("src/pages/PayrollPage.jsx", slice(4071, 4446), pageOpts);

// --- App.jsx ---
{
  const navAndTitles = slice(4449, 4477);
  const appFn = slice(4480, 4692).replace(
    /^export default function AdforceHR/,
    "export default function App",
  );
  const finalCode = navAndTitles + "\n\n" + appFn;

  const pageImports = [
    `import { LoginPage } from "./pages/LoginPage.jsx";`,
    `import { ForcePasswordChange } from "./pages/ForcePasswordChange.jsx";`,
    `import { Dashboard } from "./pages/Dashboard.jsx";`,
    `import { PeoplePage } from "./pages/PeoplePage.jsx";`,
    `import { AttendancePage } from "./pages/AttendancePage.jsx";`,
    `import { ShortLeavePage } from "./pages/ShortLeavePage.jsx";`,
    `import { PayrollPage } from "./pages/PayrollPage.jsx";`,
    `import { LeavePage } from "./pages/LeavePage.jsx";`,
    `import { AnnouncementsPage } from "./pages/AnnouncementsPage.jsx";`,
    `import { MyProfilePage } from "./pages/MyProfilePage.jsx";`,
    `import { SettingsPage } from "./pages/SettingsPage.jsx";`,
    `import { ExecutivesPage } from "./pages/ExecutivesPage.jsx";`,
    `import { PoliciesPage } from "./pages/PoliciesPage.jsx";`,
    `import { AssetsPage } from "./pages/AssetsPage.jsx";`,
  ];

  writeFile(
    "src/App.jsx",
    makeImports(finalCode, {
      brandPath: "./brand.jsx",
      utilsPath: "./utils.js",
      uiPath: "./components/ui.jsx",
      apiPath: "./api.js",
      extraImports: pageImports,
    }) + finalCode,
  );
}

writeFile("adforce-hr.jsx", `export { default } from "./src/App.jsx";\n`);

writeFile(
  "src/main.jsx",
  `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
);

console.log("Split complete.");
