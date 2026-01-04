import { SessionManager, SettingsManager, createAgentSession, createCodingTools, discoverAuthStorage, discoverModels, } from "@mariozechner/pi-coding-agent";
import { buildPrompt } from "./context.js";
export async function runAgent(piContext, config, authStorage, modelRegistry) {
    const prompt = buildPrompt(piContext);
    // Use provided or discover auth/models
    const auth = authStorage ?? discoverAuthStorage();
    const models = modelRegistry ?? discoverModels(auth);
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
        const { session } = await createAgentSession({
            cwd: config.cwd,
            model,
            thinkingLevel: "off",
            authStorage: auth,
            modelRegistry: models,
            tools: createCodingTools(config.cwd),
            sessionManager: SessionManager.inMemory(),
            settingsManager: SettingsManager.inMemory({
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
