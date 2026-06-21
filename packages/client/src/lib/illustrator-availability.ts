import type { AgentConfigRow } from "../hooks/use-agents";

export function isIllustratorAgentEnabled(agents: AgentConfigRow[] | undefined): boolean {
  const row = agents?.find((agent) => agent.type === "illustrator");
  return row?.enabled === "true";
}

export function illustratorSetupHint(agents: AgentConfigRow[] | undefined): string {
  if (!isIllustratorAgentEnabled(agents)) {
    return "Enable the Illustrator agent in Settings → Agents";
  }
  return "Illustrate this moment using context up to this message";
}
