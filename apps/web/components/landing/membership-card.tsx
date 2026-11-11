"use client";

import dynamic from "next/dynamic";
import { badgeSceneDefaults } from "@todalo/badge";

// three.js only loads in the browser, and only for this section.
const BadgeCard = dynamic(() => import("@todalo/badge").then(m => m.BadgeCard), {
  ssr: false,
  loading: () => <div className="aspect-[0.69] w-full rounded-[4.5%] bg-[#f6f5f2]" />,
});

/** The badge the visitor would get if they signed up now. */
export function MembershipCard({ member, founding }: { member: number; founding: boolean }) {
  return (
    // a fixed width: the grid column sizes to its content, so a full-width card would collapse
    <div className="w-[min(380px,82vw)]" style={{ "--badge-display": "var(--font-sanela)" } as React.CSSProperties}>
      <BadgeCard member={member} name="Your name" since={new Date()} founding={founding} logo="/todalo-logo.svg" params={badgeSceneDefaults} width="100%" />
    </div>
  );
}
