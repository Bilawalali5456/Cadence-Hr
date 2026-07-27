import React from "react";
import { Check, X, Timer } from "lucide-react";
import { approvalStatusLabel } from "../utils.js";
import { Pill } from "./ui.jsx";

export function ApprovalReviewMeta({ req }) {
  if (!req?.reviewedBy) return null;
  return (
    <div className="text-xs text-slate-400 mt-0.5">
      {req.reviewedBy} · {req.reviewedOn}
    </div>
  );
}

export function ApprovalStatusBadge({ req }) {
  const label = approvalStatusLabel(req);
  if (label) {
    const tone = req.status === "approved" ? "green" : req.status === "rejected" ? "slate" : "amber";
    return <Pill tone={tone}>{label}</Pill>;
  }
  if (req?.status === "pending") return <Pill tone="amber"><Timer size={12} />Pending</Pill>;
  if (req?.status === "approved") return <Pill tone="green"><Check size={12} />Approved</Pill>;
  if (req?.status === "rejected") return <Pill tone="red"><X size={12} />Rejected</Pill>;
  return null;
}

export function ApprovalActionButtons({ req, canChange, onApprove, onReject }) {
  if (!canChange) return null;
  return (
    <div className="flex gap-2">
      {req.status !== "approved" && (
        <button
          type="button"
          onClick={onApprove}
          className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
          style={{ background: "#16a34a" }}
        >
          Approve
        </button>
      )}
      {req.status !== "rejected" && (
        <button
          type="button"
          onClick={onReject}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50"
        >
          Reject
        </button>
      )}
    </div>
  );
}
