"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { PageLoader, EmptyState } from "@/components/ui/Loader";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Id } from "@/convex/_generated/dataModel";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountsPage() {
  const accounts = useQuery(api.accounts.list);
  const settings = useQuery(api.settings.getAll);
  const addAccount = useMutation(api.accounts.add);
  const updateAccount = useMutation(api.accounts.update);
  const removeAccount = useMutation(api.accounts.remove);
  const syncAccount = useAction(api.sync.syncAccount);
  const syncAllAction = useAction(api.sync.syncAll);
  const toast = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"ad_accounts">;
    name: string;
  } | null>(null);
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualCurrency, setManualCurrency] = useState("USD");
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  if (!accounts || !settings) return <PageLoader />;

  const openAddModal = () => {
    setShowAddModal(true);
    setManualId("");
    setManualName("");
    setManualCurrency("USD");
  };

  const handleAddAccount = async () => {
    const accountId = manualId.trim();
    const name = manualName.trim();

    if (!accountId || !name) {
      toast.error("Both account ID and name are required");
      return;
    }

    setAdding(true);
    try {
      const id = await addAccount({
        meta_account_id: accountId,
        name,
        currency: manualCurrency,
      });
      setShowAddModal(false);
      toast.success(`Account "${name}" added`);

      // Auto-sync
      toast.info("Starting initial sync...");
      try {
        const result = await syncAccount({ account_id: id });
        toast.success(`Synced ${result.synced} creatives`);
      } catch {
        toast.warning("Sync failed. You can retry from the accounts page.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (
    id: Id<"ad_accounts">,
    currentlyActive: boolean
  ) => {
    try {
      await updateAccount({ id, is_active: !currentlyActive });
    } catch {
      toast.error("Failed to update account");
    }
  };

  const handleSync = async (id: Id<"ad_accounts">) => {
    setSyncingId(id);
    try {
      const result = await syncAccount({ account_id: id });
      toast.success(`Synced ${result.synced} creatives`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const result = await syncAllAction({});
      const totalSynced = result.results.reduce(
        (s: number, r: { synced?: number }) => s + (r.synced || 0),
        0
      );
      const errors = result.results.filter(
        (r: { error?: string }) => r.error
      );
      if (errors.length > 0) {
        toast.warning(
          `Synced ${totalSynced} creatives with ${errors.length} error(s)`
        );
      } else {
        toast.success(`Synced ${totalSynced} creatives across all accounts`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeAccount({ id: deleteTarget.id });
      toast.success("Account removed");
    } catch {
      toast.error("Failed to delete account");
    }
    setDeleteTarget(null);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Ad Accounts</h2>
        <div className="header-actions">
          {accounts.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={handleSyncAll}
              disabled={syncingAll}
            >
              {syncingAll ? "Syncing all..." : "Sync All"}
            </button>
          )}
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Account
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>}
          title="No accounts yet"
          description="Add a Meta ad account to start syncing creative data."
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Account ID</th>
                <th>Status</th>
                <th>Last Synced</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a._id}>
                  <td className="cell-primary">{a.name}</td>
                  <td className="cell-mono">{a.meta_account_id}</td>
                  <td>
                    <button
                      className={`pill ${
                        a.is_active ? "pill-active" : "pill-inactive"
                      }`}
                      onClick={() => handleToggleActive(a._id, a.is_active)}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="cell-muted">
                    {a.last_synced_at ? formatDate(a.last_synced_at) : "Never"}
                  </td>
                  <td>
                    <div className="action-group">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleSync(a._id)}
                        disabled={syncingId === a._id}
                      >
                        {syncingId === a._id ? "Syncing..." : "Sync"}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger-text"
                        onClick={() =>
                          setDeleteTarget({ id: a._id, name: a.name })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Account Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)}>
        <div className="modal-header">
          <h3>Add Ad Account</h3>
          <button
            className="modal-close"
            onClick={() => setShowAddModal(false)}
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="helper-text">
            Enter your Meta ad account details. You can find the account ID in
            Ads Manager.
          </p>
          <div className="form-stack">
            <input
              type="text"
              className="input"
              placeholder="Account ID (e.g. 123456789)"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
            />
            <input
              type="text"
              className="input"
              placeholder="Account name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <select
              className="input"
              value={manualCurrency}
              onChange={(e) => setManualCurrency(e.target.value)}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (&euro;)</option>
              <option value="GBP">GBP (&pound;)</option>
              <option value="SEK">SEK (kr)</option>
              <option value="NOK">NOK (kr)</option>
              <option value="DKK">DKK (kr)</option>
              <option value="AUD">AUD (A$)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="JPY">JPY (&yen;)</option>
              <option value="CHF">CHF</option>
              <option value="BRL">BRL (R$)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setShowAddModal(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAddAccount}
            disabled={adding}
          >
            {adding ? "Adding..." : "Add Account"}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Account"
        message={<>Are you sure you want to remove <strong>{deleteTarget?.name || ""}</strong>? This won&apos;t delete any synced creative data.</>}
        confirmLabel="Delete Account"
        confirmClass="btn-danger"
      />
    </div>
  );
}
