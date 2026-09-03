import { createFileRoute } from "@tanstack/react-router";
import { HotBlotter } from "@/components/trench/hot-blotter";

export const Route = createFileRoute("/hot")({ component: HotPage });

function HotPage() {
  return <HotBlotter />;
}
