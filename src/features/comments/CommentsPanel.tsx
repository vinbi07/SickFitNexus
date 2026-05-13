import { useState } from "react";
import type { Comment } from "@/types/domain";
import { supportService } from "@/services/supportService";
import { formatDate } from "@/utils/format";

export function CommentsPanel({
  entityType,
  entityId,
  comments,
  onSaved,
}: {
  entityType: string;
  entityId: string;
  comments: Comment[];
  onSaved: () => Promise<void>;
}) {
  const [commenterName, setCommenterName] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <h3>Comments</h3>
      </div>
      <div className="comment-list">
        {comments.map((comment) => (
          <div key={comment.id} className="comment-card">
            <strong>{comment.commenter_name}</strong>
            <p>{comment.body}</p>
            <span className="muted">{formatDate(comment.created_at)}</span>
          </div>
        ))}
      </div>
      <div className="form-grid">
        <div className="field field-half">
          <label>Commenter name</label>
          <input value={commenterName} onChange={(event) => setCommenterName(event.target.value)} />
        </div>
        <div className="field field-wide">
          <label>Comment</label>
          <textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
        </div>
      </div>
      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={async () => {
            await supportService.saveComment({
              related_entity_type: entityType,
              related_entity_id: entityId,
              commenter_name: commenterName,
              body,
            });
            setCommenterName("");
            setBody("");
            await onSaved();
          }}
        >
          Add Comment
        </button>
      </div>
    </div>
  );
}
