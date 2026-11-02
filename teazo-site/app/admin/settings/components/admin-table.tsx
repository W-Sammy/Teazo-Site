"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { adminButtonStyles } from "@/app/admin/components/admin-button-styles";
import type {
  Admin,
  NewAdminInput,
} from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";
import { AddAdminModal } from "@/app/admin/settings/components/AddAdminModal";
import { EditAccountModal } from "@/app/admin/settings/components/EditAccountModal";
import { AdminRow } from "@/app/admin/settings/components/AdminRow";
import TransferOwnershipDialog from "@/app/admin/settings/components/transfer-ownership-dialog";
import DeleteAdminDialog from "@/app/admin/settings/components/delete-admin-dialog";
import { useAdmins } from "@/app/admin/settings/handlers/use-admins";
import { resendAdminInvitation } from "@/app/api/admin/settings/admins-api";

type PendingTransfer = {
  id: string;
  recipientAdminId: string;
  recipientUsername: string;
  recipientEmail: string;
  createdAt: number;
  expiresAt: number;
  status: "pending";
};

type PendingTransferResponse = {
  transfer?: PendingTransfer | null;
  error?: string;
};

type PendingLookupResult =
  | { ok: true; transfer: PendingTransfer | null }
  | { ok: false };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Fetch data without updating component state.
async function fetchPendingTransfer(): Promise<PendingTransfer | null> {
  const response = await fetch(
    "/api/admin/ownership-transfer",
    {
      credentials: "same-origin",
      cache: "no-store",
    },
  );

  const result =
    (await response.json()) as PendingTransferResponse;

  if (!response.ok) {
    throw new Error(
      result.error ?? "Unable to load pending transfer.",
    );
  }

  return result.transfer ?? null;
}

export default function AdminsTable() {
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [adminToDelete, setAdminToDelete] =
    useState<Admin | null>(null);
  const [adminToEdit, setAdminToEdit] =
    useState<Admin | null>(null);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [resendingAdminId, setResendingAdminId] =
    useState<string | null>(null);
  const [invitationNotice, setInvitationNotice] =
    useState("");

  const editInFlight = useRef(false);
  const resendInFlight = useRef(false);
  const transferInFlight = useRef(false);
  const cancelInFlight = useRef(false);

  const [transferTarget, setTransferTarget] =
    useState<Admin | null>(null);
  const [transferError, setTransferError] = useState("");
  const [isSendingTransfer, setIsSendingTransfer] =
    useState(false);
  const [transferNotice, setTransferNotice] =
    useState("");

  const [pendingTransfer, setPendingTransfer] =
    useState<PendingTransfer | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelingTransfer, setIsCancelingTransfer] =
    useState(false);

  const {
    admins,
    canManageAdmins,
    errorMessage: adminError,
    clearError,
    setError,
    addAdmin,
    loadAdmins,
    deleteAdmin,
    editAdminUsername,
  } = useAdmins();

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  // Return the refreshed status so callers can distinguish
  // no pending transfer from a failed status lookup.
  const loadPendingTransfer =
    useCallback(async (): Promise<PendingLookupResult> => {
      try {
        const transfer = await fetchPendingTransfer();

        setPendingTransfer(transfer);
        setPendingLoaded(true);
        setPendingError("");
        setConfirmCancel(false);

        return { ok: true, transfer };
      } catch (error) {
        setPendingLoaded(false);
        setPendingTransfer(null);
        setPendingError(
          errorMessage(
            error,
            "Unable to load pending transfer.",
          ),
        );

        return { ok: false };
      }
    }, []);

  // Initial lookup. State updates happen asynchronously
  // after the request completes, not synchronously in effect.
  useEffect(() => {
    let active = true;

    void fetchPendingTransfer()
      .then((transfer) => {
        if (!active) return;

        setPendingTransfer(transfer);
        setPendingLoaded(true);
        setPendingError("");
      })
      .catch((error: unknown) => {
        if (!active) return;

        setPendingLoaded(false);
        setPendingTransfer(null);
        setPendingError(
          errorMessage(
            error,
            "Unable to load pending transfer.",
          ),
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // Automatically refresh around the expiration deadline.
  // A manual Refresh Status button is also available if a
  // request is accepted, declined, or canceled elsewhere.
  useEffect(() => {
    if (!pendingLoaded || !pendingTransfer) return;

    const remaining =
      pendingTransfer.expiresAt * 1000 - Date.now() + 1000;

    // Avoid repeated immediate requests if the browser clock
    // differs from the database server's clock.
    const delay = Math.max(
      30_000,
      Math.min(remaining, 2_147_000_000),
    );

    const timeout = window.setTimeout(() => {
      void loadPendingTransfer();
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [pendingLoaded, pendingTransfer, loadPendingTransfer]);

  // Automatically clear operation errors.
  useEffect(() => {
    if (!adminError) return;

    const timeout = window.setTimeout(clearError, 3500);

    return () => window.clearTimeout(timeout);
  }, [clearError, adminError]);

  // Automatically clear success messages.
  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(
      () => setSuccessMessage(""),
      3500,
    );

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const owner = admins.find(
    (admin) => admin.role === OWNER_ROLE,
  );

  const regularAdmins = admins.filter(
    (admin) => admin.role !== OWNER_ROLE,
  );

  async function handleAddAdmin(input: NewAdminInput) {
    clearError();
    setSuccessMessage("");
    setInvitationNotice("");

    const result = await addAdmin(input);

    if (!result.success) {
      setModalError(result.error);
      return;
    }

    setModalError("");
    setShowModal(false);

    if (result.invitation.submitted) {
      setSuccessMessage(result.invitation.message);
    } else {
      setInvitationNotice(result.invitation.message);
    }
  }

  // Only the Owner receives the account-editing action. Keep
  // the dialog separate from account deletion and ownership transfer.
  function handleEditAdmin(admin: Admin) {
    if (!canManageAdmins || editInFlight.current) {
      return;
    }

    setEditError("");
    clearError();
    setSuccessMessage("");
    setAdminToEdit(admin);
  }

  async function handleSaveEditedAdmin(username: string) {
    if (!canManageAdmins || !adminToEdit || editInFlight.current) {
      return;
    }

    editInFlight.current = true;
    setIsSavingEdit(true);
    setEditError("");

    try {
      const result = await editAdminUsername(adminToEdit, username);

      if (!result.success) {
        setEditError(result.error);
        return;
      }

      // The hook updates its list only after the API succeeds.
      setAdminToEdit(null);
      setSuccessMessage("Administrator username updated.");
    } catch (error) {
      setEditError(
        errorMessage(error, "The administrator username could not be updated."),
      );
    } finally {
      editInFlight.current = false;
      setIsSavingEdit(false);
    }
  }

  function handleDeleteAdmin(admin: Admin) {
    if (!canManageAdmins || admin.role === OWNER_ROLE) {
      return;
    }

    setAdminToDelete(admin);
  }

  async function confirmDeleteAdmin() {
    if (!canManageAdmins || !adminToDelete) {
      return;
    }

    const deleted = await deleteAdmin(adminToDelete);

    if (deleted) setAdminToDelete(null);
  }

  async function handleResendInvitation(admin: Admin) {
    if (
      resendInFlight.current ||
      !canManageAdmins ||
      !admin.canResendInvitation
    ) {
      return;
    }

    resendInFlight.current = true;
    setResendingAdminId(admin.id);
    clearError();
    setSuccessMessage("");
    setInvitationNotice("");

    try {
      const result = await resendAdminInvitation(admin.id);

      setSuccessMessage(result.message);
      await loadAdmins();
    } catch (error) {
      await loadAdmins();

      setError(
        errorMessage(
          error,
          "The invitation could not be resent.",
        ),
      );
    } finally {
      resendInFlight.current = false;
      setResendingAdminId(null);
    }
  }

  const canInitiateTransfer =
    canManageAdmins &&
    pendingLoaded &&
    !pendingTransfer &&
    !isSendingTransfer &&
    !isCancelingTransfer;

  function handleTransferOwnership(admin: Admin) {
    if (
      !canInitiateTransfer ||
      !admin.canReceiveOwnership ||
      admin.role === OWNER_ROLE ||
      transferInFlight.current
    ) {
      return;
    }

    setTransferTarget(admin);
    setTransferError("");
    setTransferNotice("");
  }

  async function confirmTransferOwnership() {
    if (
      !canInitiateTransfer ||
      !transferTarget ||
      !transferTarget.canReceiveOwnership ||
      transferInFlight.current
    ) {
      return;
    }

    transferInFlight.current = true;
    setIsSendingTransfer(true);
    setTransferError("");
    setTransferNotice("");

    try {
      const response = await fetch(
        "/api/admin/ownership-transfer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            recipientAdminId: transferTarget.id,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
        invitation?: { message: string };
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "Unable to initiate ownership transfer.",
        );
      }

      setTransferTarget(null);
      setTransferNotice(
        result.invitation?.message ??
          "Ownership offer created. The Admin must accept before roles change.",
      );

      setPendingLoaded(false);
      const refreshed = await loadPendingTransfer();

      if (!refreshed.ok) {
        setTransferNotice(
          "The ownership offer was created, but its current status could not be refreshed. Use Refresh Status before attempting another offer.",
        );
      }
    } catch (error) {
      const failure = errorMessage(
        error,
        "Unable to initiate ownership transfer.",
      );

      // A response failure does not prove that no request
      // was created. Verify status before another attempt.
      setPendingLoaded(false);
      const refreshed = await loadPendingTransfer();

      if (refreshed.ok && refreshed.transfer) {
        setTransferTarget(null);
        setTransferNotice(
          `${failure} A transfer remains pending. Review or cancel it below before trying again.`,
        );
      } else if (refreshed.ok) {
        setTransferError(failure);
      } else {
        setTransferTarget(null);
        setTransferNotice(
          `${failure} Pending status could not be verified. Use Refresh Status before attempting another offer.`,
        );
      }
    } finally {
      transferInFlight.current = false;
      setIsSendingTransfer(false);
    }
  }

  async function confirmCancelOwnershipTransfer() {
    if (
      !canManageAdmins ||
      !pendingTransfer ||
      cancelInFlight.current ||
      isSendingTransfer
    ) {
      return;
    }

    cancelInFlight.current = true;
    setIsCancelingTransfer(true);
    setPendingError("");
    setTransferNotice("");

    try {
      const response = await fetch(
        "/api/admin/ownership-transfer",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            transferId: pendingTransfer.id,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "Unable to cancel ownership transfer.",
        );
      }

      setConfirmCancel(false);
      setPendingLoaded(false);

      const refreshed = await loadPendingTransfer();

      setTransferNotice(
        refreshed.ok
          ? result.message ?? "Ownership transfer canceled."
          : "Cancellation succeeded, but the current status could not be refreshed. Use Refresh Status to verify.",
      );
    } catch (error) {
      const failure = errorMessage(
        error,
        "Unable to cancel ownership transfer.",
      );

      const refreshed = await loadPendingTransfer();

      if (refreshed.ok && !refreshed.transfer) {
        setConfirmCancel(false);
        setTransferNotice(
          "No pending ownership transfer remains.",
        );
      } else {
        setPendingError(failure);
      }
    } finally {
      cancelInFlight.current = false;
      setIsCancelingTransfer(false);
    }
  }

  return (
    <>
      {adminError && (
        <div
          role="alert"
          className="fixed left-3 right-3 top-3 z-[70] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg sm:left-auto sm:right-5 sm:top-5 sm:max-w-sm"
        >
          {adminError}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-3 top-3 z-[70] rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-lg sm:right-5 sm:top-5"
        >
          {successMessage}
        </div>
      )}

      {invitationNotice && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>{invitationNotice}</p>

          <button
            type="button"
            onClick={() => setInvitationNotice("")}
            className="mt-2 cursor-pointer font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {transferNotice && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {transferNotice}
        </div>
      )}

      {/* Owner section */}
      <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
        <h2 className="text-2xl font-bold text-[#2b211d]">
          Owner
        </h2>

        <div className="w-full min-w-0 max-w-5xl">
          <div className="hidden items-center gap-4 border-b border-gray-100 pb-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_40px]">
            <div className="text-sm font-semibold text-gray-500">
              Username
            </div>
            <div className="text-sm font-semibold text-gray-500">
              Email
            </div>
            <div aria-hidden="true" />
          </div>

          {owner ? (
            <AdminRow
              key={owner.id}
              admin={owner}
              showActions={canManageAdmins}
              onEdit={() => handleEditAdmin(owner)}
              onResendInvitation={() => {
                void handleResendInvitation(owner);
              }}
              isResending={resendingAdminId === owner.id}
            />
          ) : (
            <p className="py-4 text-sm text-gray-500">
              No Owner account was found.
            </p>
          )}
        </div>
      </section>

      {/* Regular administrators section */}
      <section className="mt-10 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
        <h2 className="text-2xl font-bold text-[#2b211d]">
          Admins
        </h2>

        <div className="w-full min-w-0 max-w-5xl">
          <div className="hidden items-center gap-4 border-b border-gray-100 pb-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_40px]">
            <div className="text-sm font-semibold text-gray-500">
              Username
            </div>
            <div className="text-sm font-semibold text-gray-500">
              Email
            </div>
            <div className="text-sm font-semibold text-gray-500">
              <span className="sr-only">
                Actions
              </span>
            </div>
          </div>

          <div className="space-y-3 md:space-y-0">
            {regularAdmins.length > 0 ? (
              regularAdmins.map((admin) => (
                <AdminRow
                  key={admin.id}
                  admin={admin}
                  showActions={canManageAdmins}
                  onEdit={() => handleEditAdmin(admin)}
                  onDelete={() => handleDeleteAdmin(admin)}
                  onTransferOwnership={
                    canInitiateTransfer
                      ? () => handleTransferOwnership(admin)
                      : undefined
                  }
                  isTransferring={
                    isSendingTransfer &&
                    transferTarget?.id === admin.id
                  }
                  onResendInvitation={() => {
                    void handleResendInvitation(admin);
                  }}
                  isResending={resendingAdminId === admin.id}
                />
              ))
            ) : (
              <p className="py-4 text-sm text-gray-500">
                No administrators have been added.
              </p>
            )}
          </div>

          {canManageAdmins && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className={`mt-4 inline-flex w-full items-center justify-center ${adminButtonStyles.primary} sm:w-auto`}
            >
              New User
              <span
                className="ml-2 text-base"
                aria-hidden="true"
              >
                +
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Owner-only pending transfer management follows the Admins list. */}
      {canManageAdmins && (pendingTransfer !== null || pendingError !== "") && (
        <section className="mt-10 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
          <h2 className="text-2xl font-bold text-[#2b211d]">
            Pending Ownership Transfer
          </h2>

          <div className="w-full min-w-0 max-w-5xl">
            <div className="rounded-xl border border-[#dbb082] bg-[#fffaf6] p-4 text-sm text-gray-800">
              {!pendingLoaded && !pendingError && (
                <p role="status" className="text-gray-600">
                  Checking for pending offers...
                </p>
              )}

              {pendingError && (
                <p role="alert" className="text-red-700">
                  {pendingError}
                </p>
              )}

              {pendingLoaded && pendingTransfer && (
                <div className="space-y-3">
                  <p>
                    <span className="font-semibold">Receiving Admin:</span>{" "}
                    {pendingTransfer.recipientUsername}
                    {" ("}
                    {pendingTransfer.recipientEmail}
                    {")"}
                  </p>

                  <p>
                    <span className="font-semibold">Status:</span>{" "}
                    Pending acceptance
                  </p>

                  <p>
                    <span className="font-semibold">Expires:</span>{" "}
                    {new Date(pendingTransfer.expiresAt * 1000).toLocaleString()}
                  </p>

                  <p className="text-gray-600">
                    The receiving Admin must explicitly accept. No roles have
                    changed yet.
                  </p>
                </div>
              )}

              {/* Compact, equal-width mobile controls.
                  Desktop keeps natural widths side by side. */}
              <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => {
                    setPendingLoaded(false);
                    void loadPendingTransfer();
                  }}
                  disabled={
                    isSendingTransfer ||
                    isCancelingTransfer ||
                    (!pendingLoaded && !pendingError)
                  }
                  className={`${adminButtonStyles.secondary} w-[170px] text-center sm:w-auto`}
                >
                  Refresh Status
                </button>

                {pendingLoaded && pendingTransfer && !confirmCancel && (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    disabled={isSendingTransfer || isCancelingTransfer}
                    className="w-[170px] rounded-lg border border-red-600 px-4 py-2 text-center font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
                  >
                    Cancel Transfer
                  </button>
                )}
              </div>

              {confirmCancel && pendingLoaded && pendingTransfer && (
                <div className="mt-4 rounded-lg border border-red-200 p-3">
                  <p className="font-medium text-red-700">
                    Cancel this ownership offer? Its emailed link will no longer
                    be valid.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmCancelOwnershipTransfer()}
                      disabled={isCancelingTransfer}
                      className="rounded-lg border border-red-600 px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isCancelingTransfer ? "Canceling..." : "Yes, Cancel Transfer"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      disabled={isCancelingTransfer}
                      className={adminButtonStyles.secondary}
                    >
                      Keep Offer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {canManageAdmins && showModal && (
        <AddAdminModal
          onAdd={handleAddAdmin}
          onCancel={() => {
            setModalError("");
            setShowModal(false);
          }}
          errorMessage={modalError}
        />
      )}

      {canManageAdmins && adminToEdit && (
        <EditAccountModal
          key={adminToEdit.id}
          admin={adminToEdit}
          isSaving={isSavingEdit}
          errorMessage={editError}
          onSave={handleSaveEditedAdmin}
          onCancel={() => {
            if (!editInFlight.current) {
              setAdminToEdit(null);
              setEditError("");
            }
          }}
        />
      )}

      {canManageAdmins && transferTarget && (
        <TransferOwnershipDialog
          admin={transferTarget}
          isSubmitting={isSendingTransfer}
          errorMessage={transferError}
          onCancel={() => {
            if (!isSendingTransfer) {
              setTransferTarget(null);
              setTransferError("");
            }
          }}
          onConfirm={confirmTransferOwnership}
        />
      )}

      <DeleteAdminDialog
        admin={canManageAdmins ? adminToDelete : null}
        onCancel={() => setAdminToDelete(null)}
        onConfirm={confirmDeleteAdmin}
      />
    </>
  );
}
