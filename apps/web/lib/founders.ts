/** Founder offer seats left (brief §3), from the Stripe coupon's redemptions. Null until Stripe is set up. */
export async function foundersLeft(env: Record<string, string | undefined> = process.env, request: typeof fetch = fetch): Promise<number | null> {
  const key = env.STRIPE_SECRET_KEY;
  const coupon = env.STRIPE_FOUNDERS_COUPON;
  if (!key || !coupon) return null;
  try {
    const res = await request(`https://api.stripe.com/v1/coupons/${encodeURIComponent(coupon)}`, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 300 },
    } as RequestInit);
    if (!res.ok) return null;
    const { max_redemptions, times_redeemed } = (await res.json()) as { max_redemptions: number | null; times_redeemed: number };
    return Math.max(0, (max_redemptions ?? 20) - times_redeemed);
  } catch {
    return null;
  }
}
