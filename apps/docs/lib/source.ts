import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

// Every MDX file under content/, addressed as /{folder}/{file}.
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});
