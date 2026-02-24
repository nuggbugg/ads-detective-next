"use client";

import { ReactNode } from "react";

export function Spinner() {
  return (
    <div className="spinner-wrapper">
      <div className="spinner"></div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="tab-loading">
      <Spinner />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-state-icon">{icon}</div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
    </div>
  );
}
