"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePermissions = validatePermissions;
exports.sanitizeInput = sanitizeInput;
const WRITE_ACCESS_ROLES = ["OWNER", "MEMBER", "COLLABORATOR"];
function validatePermissions(ctx) {
    if (ctx.isBot) {
        return ctx.allowedBots.includes(ctx.authorLogin);
    }
    return WRITE_ACCESS_ROLES.includes(ctx.authorAssociation);
}
function sanitizeInput(text) {
    return text
        .replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
        .replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, "") // Remove invisible characters
        .trim();
}
