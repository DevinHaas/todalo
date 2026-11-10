// The badge's display face. The landing page's Sanela files, imported as URLs since they live in apps/web.
import sanelaBlack from "../../web/app/fonts/sanela/SANELA-Black.woff2?url";
import sanelaThin from "../../web/app/fonts/sanela/SANELA-Thin.woff2?url";

for (const [src, weight] of [[sanelaBlack, "900"], [sanelaThin, "100"]]) {
  const face = new FontFace("Sanela", `url(${src})`, { weight });
  document.fonts.add(face);
  void face.load();
}
