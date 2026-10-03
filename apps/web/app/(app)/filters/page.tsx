import { getMetadata } from "../tasks/metadata-actions";
import { MetadataDirectory } from "@/components/organization/metadata-directory";
export default async function FiltersPage() { return <MetadataDirectory metadata={await getMetadata()} mode="filters" />; }
