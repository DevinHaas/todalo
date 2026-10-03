import { getMetadata } from "../tasks/metadata-actions";
import { MetadataDirectory } from "@/components/organization/metadata-directory";
export default async function LabelsPage() { return <MetadataDirectory metadata={await getMetadata()} mode="labels" />; }
