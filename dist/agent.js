"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent = runAgent;
const pi_coding_agent_1 = require("@mariozechner/pi-coding-agent");
const context_js_1 = require("./context.js");
async function runAgent(piContext, config, authStorage, modelRegistry) {
    const prompt = (0, context_js_1.buildPrompt)(piContext);
    // Use provided or discover auth/models
    const auth = authStorage ?? (0, pi_coding_agent_1.discoverAuthStorage)();
    const models = modelRegistry ?? (0, pi_coding_agent_1.discoverModels)(auth);
    // Find the model
    const model = models.find(config.provider, config.model);
    if (!model) {
        return {
            success: false,
            error: `Model not found: ${config.provider}/${config.model}`,
        };
    }
    // Collect response text
    let response = "";
    try {
        const { session } = await (0, pi_coding_agent_1.createAgentSession)({
            cwd: config.cwd,
            model,
            thinkingLevel: "off",
            authStorage: auth,
            modelRegistry: models,
            tools: (0, pi_coding_agent_1.createCodingTools)(config.cwd),
            sessionManager: pi_coding_agent_1.SessionManager.inMemory(),
            settingsManager: pi_coding_agent_1.SettingsManager.inMemory({
                compaction: { enabled: false },
                retry: { enabled: true, maxRetries: 2 },
            }),
            // Disable discovery for hooks, skills, etc. in CI environment
            hooks: [],
            skills: [],
            contextFiles: [],
            slashCommands: [],
        });
        // Subscribe to collect response
        session.subscribe((event) => {
            if (event.type === "message_update" &&
                event.assistantMessageEvent.type === "text_delta") {
                response += event.assistantMessageEvent.delta;
            }
        });
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout after ${config.timeout} seconds`)), config.timeout * 1000);
        });
        // Run with timeout
        await Promise.race([session.prompt(prompt), timeoutPromise]);
        return {
            success: true,
            response: response.trim(),
        };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
