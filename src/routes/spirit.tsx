import { createFileRoute } from "@tanstack/react-router";
import { SpiritBox } from "@/components/trench/spirit-box";

export const Route = createFileRoute("/spirit")({ component: SpiritPage });

function SpiritPage() {
  return <SpiritBox />;
}
