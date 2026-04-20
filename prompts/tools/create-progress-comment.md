# create_progress_comment

Create a progress comment on the issue/PR that can be updated throughout the session. Use this at the start of your work to post status updates. Returns the comment ID needed for updates.

## Usage

create_progress_comment: Create a progress comment that can be updated later

## Guidelines

- Use create_progress_comment to post a status comment at the start of your work.
- Store the returned comment_id to update the comment later with update_progress_comment.
- Use this to report progress, intermediate results, or keep users informed.
