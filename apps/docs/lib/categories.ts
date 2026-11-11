const definitions = [
  ["get-started", "Get started", "Set up Todalo and add your first tasks."],
  ["tasks-capture", "Tasks & capture", "Add, schedule and complete tasks."],
  ["organise-views", "Organise & views", "Sort tasks into projects and see them your way."],
  ["goals-seasons-rituals", "Goals, seasons & rituals", "Plan what matters and keep a steady rhythm."],
  ["coach", "Coach", "Set up the Coach and stay in control of what it does."],
  ["integrations", "Integrations", "Connect Todalo to your calendar."],
  ["apps-account", "Apps & account", "Shortcuts, settings, sync and sign-in."],
] as const;

export type CategorySlug = (typeof definitions)[number][0];

export type Category = {
  slug: CategorySlug;
  name: string;
  tagline: string;
  order: number;
  illustration: string;
};

export const categories: readonly Category[] = definitions.map(([slug, name, tagline], index) => ({
  slug,
  name,
  tagline,
  order: index + 1,
  illustration: `/illustrations/${slug}.png`,
}));
