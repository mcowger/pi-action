"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const agent_js_1 = require("./agent.js");
const context_js_1 = require("./context.js");
const github_js_1 = require("./github.js");
const security_js_1 = require("./security.js");
function setupAuth() {
    const authJson = core.getInput("pi_auth_json");
    if (authJson) {
        const authDir = (0, node_path_1.join)((0, node_os_1.homedir)(), ".pi", "agent");
        (0, node_fs_1.mkdirSync)(authDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(authDir, "auth.json"), authJson);
        core.info("Wrote pi auth.json");
    }
}
async function run() {
    setupAuth();
    const triggerPhrase = core.getInput("trigger_phrase") || "@pi";
    const allowedBots = (core.getInput("allowed_bots") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const timeout = Number.parseInt(core.getInput("timeout") || "300", 10);
    const provider = core.getInput("provider") || "anthropic";
    const model = core.getInput("model") || "claude-sonnet-4-20250514";
    const { context } = github;
    const { payload } = context;
    // Extract trigger info from payload
    const triggerInfo = (0, github_js_1.extractTriggerInfo)(payload);
    if (!triggerInfo) {
        core.info("No issue or pull_request in payload, skipping");
        return;
    }
    // Check if trigger phrase is present
    if (!(0, context_js_1.hasTrigger)(triggerInfo.triggerText, triggerPhrase)) {
        core.info(`No trigger phrase "${triggerPhrase}" found, skipping`);
        return;
    }
    // Validate permissions
    const securityContext = {
        authorAssociation: triggerInfo.authorAssociation,
        authorLogin: triggerInfo.author.login,
        isBot: triggerInfo.author.type === "Bot",
        allowedBots,
    };
    if (!(0, security_js_1.validatePermissions)(securityContext)) {
        core.warning(`User ${triggerInfo.author.login} (${triggerInfo.authorAssociation}) does not have permission`);
        return;
    }
    const token = core.getInput("github_token") || process.env.GITHUB_TOKEN;
    if (!token) {
        core.setFailed("github_token is required");
        return;
    }
    const octokit = github.getOctokit(token);
    const ghClient = (0, github_js_1.createGitHubClient)(octokit, context);
    // Add eyes reaction to acknowledge
    await (0, github_js_1.addReaction)(ghClient, triggerInfo, "eyes");
    // Build context
    const sanitizedBody = (0, security_js_1.sanitizeInput)(triggerInfo.triggerText);
    const task = (0, context_js_1.extractTask)(sanitizedBody, triggerPhrase);
    const piContext = {
        type: triggerInfo.isPullRequest ? "pull_request" : "issue",
        title: triggerInfo.issueTitle,
        body: triggerInfo.issueBody,
        number: triggerInfo.issueNumber,
        triggerComment: sanitizedBody,
        task,
    };
    // Get PR diff if applicable
    if (triggerInfo.isPullRequest) {
        piContext.diff = await ghClient.getPullRequestDiff(triggerInfo.issueNumber);
    }
    core.info(`Running pi agent for: ${task}`);
    // Run the agent
    const result = await (0, agent_js_1.runAgent)(piContext, {
        provider,
        model,
        timeout,
        cwd: process.cwd(),
    });
    if (result.success) {
        await (0, github_js_1.addReaction)(ghClient, triggerInfo, "rocket");
        await ghClient.createComment(triggerInfo.issueNumber, `### 🤖 pi Response\n\n${result.response}`);
    }
    else {
        core.error(`pi execution failed: ${result.error}`);
        await (0, github_js_1.addReaction)(ghClient, triggerInfo, "confused");
        await ghClient.createComment(triggerInfo.issueNumber, `### ❌ pi Error\n\nFailed to process request: ${result.error}`);
    }
}
run().catch((error) => {
    core.setFailed(error instanceof Error ? error.message : "Unknown error");
});
