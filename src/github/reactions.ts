import * as core from '@actions/core';
import * as github from '@actions/github';
import RestEndpointMethodTypes from '@octokit/plugin-rest-endpoint-methods';
import { getOctokit } from './octokit.js';
import { REACTION_TYPE_EYES } from './constants.js';

const octokit = getOctokit();

export type CreateReactionType =
  RestEndpointMethodTypes.RestEndpointMethodTypes['reactions']['createForIssueComment']['response'];
export type DeleteReactionType =
  RestEndpointMethodTypes.RestEndpointMethodTypes['reactions']['deleteForIssueComment']['response'];

export async function addReaction(): Promise<CreateReactionType | undefined> {
  const comment = github.context.payload.comment;
  if (!comment) {
    core.notice('no comment found, skipping reaction');
    return;
  }

  return await octokit.rest.reactions.createForIssueComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    comment_id: comment.id,
    content: REACTION_TYPE_EYES,
  });
}

export async function deleteReaction(
  reaction: CreateReactionType | undefined
): Promise<DeleteReactionType | undefined> {
  if (!reaction) {
    return;
  }

  const comment = github.context.payload.comment;
  if (!comment) {
    return;
  }

  return octokit.rest.reactions.deleteForIssueComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    comment_id: comment.id,
    reaction_id: reaction.data.id,
  });
}
