/**
 * Pakistan income tax (annual slabs) → monthly withholding.
 * Annual gross = monthly gross × 12; monthly tax = annual tax / 12.
 */
export function calculateAnnualTax(annualGross) {
  const income = Math.max(0, Number(annualGross) || 0);
  if (income <= 600000) return 0;
  if (income <= 1200000) return (income - 600000) * 0.05;
  if (income <= 2400000) return 30000 + (income - 1200000) * 0.15;
  if (income <= 3600000) return 210000 + (income - 2400000) * 0.25;
  if (income <= 6000000) return 510000 + (income - 3600000) * 0.3;
  return 1230000 + (income - 6000000) * 0.35;
}

/** Monthly income tax from monthly gross salary (PKR). */
export function calculateMonthlyTax(grossMonthlySalary) {
  const monthly = Math.max(0, Number(grossMonthlySalary) || 0);
  const annual = monthly * 12;
  const annualTax = calculateAnnualTax(annual);
  return Math.round((annualTax / 12) * 100) / 100;
}

export function parseSalaryAmount(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
