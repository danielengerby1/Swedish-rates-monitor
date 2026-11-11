/**
 * Monthly cost of a Swedish mortgage. Interest is tax-deductible (ränteavdrag): 30% of interest
 * up to 100,000 SEK a year and 21% above that (Skatteverket rules for individuals). Amortisation
 * is entered as a yearly percentage of the loan; the official requirement depends on loan-to-value
 * and debt-to-income, so it is left to the user.
 */
export const TAX_DEDUCTION = { rate: 0.3, threshold: 100_000, rateAbove: 0.21 };

export function yearlyDeduction(interest: number): number {
  const { rate, threshold, rateAbove } = TAX_DEDUCTION;
  return Math.min(interest, threshold) * rate + Math.max(0, interest - threshold) * rateAbove;
}

export interface MortgageCost {
  interest: number; // per month, before tax deduction
  deduction: number; // per month
  amortisation: number; // per month
  total: number; // per month: interest - deduction + amortisation
}

export function monthlyCost(loan: number, rate: number, amortisationRate: number): MortgageCost {
  const yearlyInterest = loan * rate;
  const interest = yearlyInterest / 12;
  const deduction = yearlyDeduction(yearlyInterest) / 12;
  const amortisation = (loan * amortisationRate) / 12;
  return { interest, deduction, amortisation, total: interest - deduction + amortisation };
}
