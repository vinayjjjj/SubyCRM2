import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();
export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-sonnet-4-6";
