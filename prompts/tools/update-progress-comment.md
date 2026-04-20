# update_progress_comment

Update an existing progress comment by its ID. Use this to report progress, add results, or modify content in a comment you created earlier with create_progress_comment.

## Usage

update_progress_comment: Update an existing progress comment by ID

## Guidelines

- Use update_progress_comment to modify an existing comment you created earlier.
- The comment_id parameter must be the ID returned by create_progress_comment.
- The body parameter will completely replace the existing comment content.
