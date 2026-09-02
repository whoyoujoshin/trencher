import { createFileRoute } from "@tanstack/react-router";
import { TrenchApp } from "@/components/trench/terminal";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TrenchApp />;
}
