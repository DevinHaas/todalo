// Founder spots: one number for the founding-member badge and the Lifetime founders' price.
// No database import, so client components (the pricing table) can use it too.
export const FOUNDING_MEMBERS = 100;
export const isFoundingMember = (number: number) => number <= FOUNDING_MEMBERS;
