export type IllustratorAgentOutput = {
  shouldGenerate?: boolean;
  prompt?: string;
};

export function resolveRetryIllustrationIntent(args: {
  illData: IllustratorAgentOutput;
  forceIllustrate?: boolean;
  anchorMessageContent?: string;
}): { proceed: true; prompt: string } | null {
  const agentPrompt = (args.illData.prompt ?? "").trim();
  const shouldGenerate = args.illData.shouldGenerate === true;

  if (!args.forceIllustrate) {
    if (shouldGenerate && agentPrompt) {
      return { proceed: true, prompt: agentPrompt };
    }
    return null;
  }

  if (agentPrompt) {
    return { proceed: true, prompt: agentPrompt };
  }

  const anchor = (args.anchorMessageContent ?? "").trim();
  if (anchor) {
    const excerpt = anchor.length > 600 ? `${anchor.slice(0, 600)}...` : anchor;
    return {
      proceed: true,
      prompt: `Illustrate this story moment at the user's request: ${excerpt}`,
    };
  }

  return { proceed: true, prompt: "Illustrate the current scene from the conversation" };
}
