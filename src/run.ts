/**
 * @file Main orchestration logic for the Pi GitHub Action.
 *
 * Reads action inputs (provider, model, token, thinking_level), fetches the
 * user prompt from the triggering GitHub comment, initialises a Pi client
 * session, sends the prompt, and posts the result (or error) back as a GitHub
 * comment. An "eyes" reaction is added while processing to give visual feedback.
 */

import * as core from '@actions/core';
import { Client } from './pi';
import { addReaction, deleteReaction, createFinalComment, getPrompt } from './github/index';
import type { CreateReactionType } from './github/index';

/**
 * Run the Pi coding agent end-to-end.
 *
 * Reads action inputs, fetches the prompt from the triggering comment, creates a
 * Pi client session, sends the prompt, and posts the result (or error) back as a
 * GitHub comment. An "eyes" reaction is added while processing to give visual
 * feedback and is always cleaned up afterwards.
 *
 * @throws Rethrows any error from the Pi session after posting it as a comment.
 */
export async function run() {
  const provider = core.getInput('provider');
  const model = core.getInput('model');
  const token = core.getInput('token');
  const thinkingInput = core.getInput('thinking_level') ?? 'off';

  const prompt = await getPrompt();
  if (!prompt) {
    return;
  }

  let reaction: CreateReactionType | undefined;
  let result: string;

  try {
    reaction = await addReaction();

    // Pi session execution
    const pi = await new Client(model, provider, token, thinkingInput).ready();
    result = await pi.prompt(prompt);
  } catch (e) {
    if (reaction) {
      await deleteReaction(reaction);
    }
    await createFinalComment(e instanceof Error ? e.message : String(e));
    throw e;
  }

  if (reaction) {
    await deleteReaction(reaction);
  }
  await createFinalComment(result);
}
