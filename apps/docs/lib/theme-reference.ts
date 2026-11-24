// "Use custom CSS" lists the client's public theming API (variables and regions)
// straight from its source, so the reference can't drift from what themes can target.
import { themeVariables, type ThemeGroup, type ThemeVariable } from "../../client/src/theme-reference";
export { themeRegions } from "../../client/src/theme-reference";

// Record: a new group in the client fails the typecheck until it has a title here.
const groupTitles: Record<ThemeGroup, string> = {
  surface: "Surfaces and text", brand: "Brand and buttons", status: "Status and priority", line: "Borders and focus",
  sidebar: "Sidebar", font: "Fonts", text: "Text sizes", spacing: "Sizes", radius: "Corners", shadow: "Shadows", design: "Appearance",
};

/** The variables in the client's order, under one title per group. */
export function variableGroups(): { title: string; variables: ThemeVariable[] }[] {
  return (Object.keys(groupTitles) as ThemeGroup[]).map((group) => ({
    title: groupTitles[group],
    variables: themeVariables.filter((variable) => variable.group === group),
  }));
}
