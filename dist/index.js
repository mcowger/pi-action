// src/index.ts
import { execSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";

// src/context.ts
function hasTrigger(text, trigger) {
  return text.toLowerCase().includes(trigger.toLowerCase());
}
function extractTask(comment, trigger) {
  const idx = comment.toLowerCase().indexOf(trigger.toLowerCase());
  if (idx === -1) return comment;
  return comment.slice(idx + trigger.length).trim();
}
function buildPrompt(context) {
  let prompt = `# GitHub ${context.type === "pull_request" ? "Pull Request" : "Issue"} #${context.number}

## Title
${context.title}

## Description
${context.body}

## Task
${context.task}

## Important: Artifact and Script Requirements

**CRITICAL:** After the GitHub Action finishes running, all files modified or created are lost, and the GitHub Action runner is destroyed. Therefore:

1. **All generated code and artifacts MUST be committed** - Any files you create, modify, or generate must be committed and pushed to the repository before the action completes. Nothing will persist otherwise.

2. **Any throw-away scripts generated MUST be run immediately** - If you create temporary scripts (like \`/tmp/create-issues.sh\` or similar), you must execute them during the same session. They will be lost when the runner terminates.

3. **Commit and push all work** - Always end your work by committing and pushing changes to ensure they persist beyond the GitHub Action execution.
`;
  if (context.diff) {
    prompt += `
## PR Diff
\`\`\`diff
${context.diff}
\`\`\`
`;
  }
  return prompt;
}

// src/security.ts
var WRITE_ACCESS_ROLES = ["OWNER", "MEMBER", "COLLABORATOR"];
function validatePermissions(ctx) {
  if (ctx.isBot) {
    return ctx.allowedBots.includes(ctx.authorLogin);
  }
  return WRITE_ACCESS_ROLES.includes(ctx.authorAssociation);
}
function sanitizeInput(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "").replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, "").trim();
}

// src/index.ts
function setupAuth() {
  const authJson = core.getInput("pi_auth_json");
  if (authJson) {
    const authDir = join(homedir(), ".pi", "agent");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, "auth.json"), authJson);
    core.info("Wrote PI auth.json");
  }
}
async function run() {
  setupAuth();
  const triggerPhrase = core.getInput("trigger_phrase") || "@pi";
  const allowedBots = (core.getInput("allowed_bots") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const timeout = Number.parseInt(core.getInput("timeout") || "300", 10);
  const provider = core.getInput("provider") || "anthropic";
  const model = core.getInput("model") || "claude-sonnet-4-20250514";
  const { context } = github;
  const { payload } = context;
  const comment = payload.comment;
  if (!comment) {
    core.info("No comment in payload, skipping");
    return;
  }
  if (!hasTrigger(comment.body, triggerPhrase)) {
    core.info(`No trigger phrase "${triggerPhrase}" found, skipping`);
    return;
  }
  const securityContext = {
    authorAssociation: comment.author_association,
    authorLogin: comment.user.login,
    isBot: comment.user.type === "Bot",
    allowedBots
  };
  if (!validatePermissions(securityContext)) {
    core.warning(
      `User ${comment.user.login} (${comment.author_association}) does not have permission`
    );
    return;
  }
  const token = core.getInput("github_token") || process.env.GITHUB_TOKEN;
  if (!token) {
    core.setFailed("github_token is required");
    return;
  }
  const octokit = github.getOctokit(token);
  const issue = payload.issue || payload.pull_request;
  if (!issue) {
    core.info("No issue or pull_request in payload, skipping");
    return;
  }
  await octokit.rest.reactions.createForIssueComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    comment_id: comment.id,
    content: "eyes"
  });
  const sanitizedBody = sanitizeInput(comment.body);
  const task = extractTask(sanitizedBody, triggerPhrase);
  const piContext = {
    type: payload.pull_request ? "pull_request" : "issue",
    title: issue.title,
    body: issue.body || "",
    number: issue.number,
    triggerComment: sanitizedBody,
    task
  };
  if (payload.pull_request) {
    const { data: diff } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: issue.number,
      mediaType: { format: "diff" }
    });
    piContext.diff = diff;
  }
  const prompt = buildPrompt(piContext);
  core.info(`Prompt:
${prompt}`);
  const promptFile = join(tmpdir(), `pi-prompt-${Date.now()}.md`);
  writeFileSync(promptFile, prompt);
  let response;
  try {
    const cmd = `pi --provider ${provider} --model ${model} -p @${promptFile}`;
    core.info(`Running: ${cmd}`);
    response = execSync(cmd, {
      encoding: "utf-8",
      timeout: timeout * 1e3,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error2) {
    const errorMessage = error2 instanceof Error ? error2.message : "Unknown error";
    core.error(`PI execution failed: ${errorMessage}`);
    await octokit.rest.reactions.createForIssueComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: comment.id,
      content: "confused"
    });
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: `### \u274C PI Error

Failed to process request: ${errorMessage}`
    });
    return;
  } finally {
    try {
      unlinkSync(promptFile);
    } catch {
    }
  }
  await octokit.rest.reactions.createForIssueComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    comment_id: comment.id,
    content: "rocket"
  });
  await octokit.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issue.number,
    body: `### \u{1F916} PI Response

${response}`
  });
}
run().catch((error2) => {
  core.setFailed(error2 instanceof Error ? error2.message : "Unknown error");
});
