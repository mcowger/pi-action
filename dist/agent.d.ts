import { type AuthStorage, type ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { PIContext } from "./context.js";
export interface AgentConfig {
    provider: string;
    model: string;
    timeout: number;
    cwd: string;
}
export interface AgentResult {
    success: boolean;
    response?: string;
    error?: string;
}
export declare function runAgent(piContext: PIContext, config: AgentConfig, authStorage?: AuthStorage, modelRegistry?: ModelRegistry): Promise<AgentResult>;
