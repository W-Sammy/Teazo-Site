# TEAZO Ownership Transfer and Owner Account Recovery

## Purpose

This document describes the TEAZO administrator roles, the Owner-initiated ownership-transfer process, security controls, administrator account editing, password recovery, deployment considerations, and operational limitations.

The ownership-transfer feature is managed through the Owner-only Admin page. It is intended for deliberate transfers between existing, eligible administrator accounts.

Emergency Owner account recovery is not implemented.

## 1. Administrator roles

TEAZO supports two administrator roles:

| Role | Database role ID | Permissions |
| --- | --- | --- |
| Owner | 1 | Manage administrative content, access the Owner-only Admin page, add and remove       administrators, edit administrator usernames, and initiate or cancel ownership offers |
| Admin | 2 | Manage authorized site content, including Menu, Gallery, Events, and Website Content; cannot manage administrator membership or edit administrator account details |

Both roles can access the administrative Dashboard and authorized content-management functionality.

Only the Owner can access the Owner-only administrator-management page, labeled **Admin** in navigation.

The administrator-management page remains at `/admin/settings`. The existing Dashboard remains at `/admin`.

The Admin page displays Owner and Admin accounts in separate sections. Regular Admins cannot access this page through navigation, direct URLs, or administrator-management API requests.

The system supports exactly one current Owner. The database includes a unique Owner constraint to prevent multiple non-deleted Owner records.

A regular Admin cannot promote themselves or another account through the Admin interface or administrator-management API.

New administrators are created with role ID 2. Ownership changes occur only through the designated transfer process.

## 2. Eligibility and prerequisites

An ownership transfer requires:

- An authenticated, active Owner initiating the offer.
- An existing, active Admin receiving the offer.
- A receiving account that is not deleted or suspended.
- No other pending ownership-transfer request.
- A working database connection and correctly configured email-delivery service.

Invited administrators who have not completed account activation are not eligible to receive ownership.

The current Owner cannot transfer ownership to themselves.

The receiving Admin must be able to authenticate through an existing supported sign-in method.

## 3. Initiating ownership transfer

The current Owner performs these steps:

1. Sign in to the TEAZO administrative website.
2. Open **Admin** from the administrative navigation.
3. Locate the eligible Admin who should receive ownership.
4. Open the Admin's three-dot menu.
5. Select **Transfer Ownership**.
6. Review the confirmation dialog and receiving-account details.
7. Acknowledge that accepting the offer will remove the current Owner's Owner-only privileges.
8. Select **Send Ownership Offer**.

The confirmation dialog uses neutral wording rather than constructing sentences from administrator usernames.

Creating an offer does not immediately change either user's role.

The receiving Admin is sent an invitation containing a link to the ownership-transfer review page.

The Owner can view the pending recipient, status, and expiration time in the **Pending Ownership Transfer** section.

This section appears below the Admins list and New User button. It is hidden when no transfer is pending.

The system permits only one pending ownership offer at a time.

## 4. Reviewing an offer

The receiving Admin opens the emailed **Review ownership transfer** link.

The link opens:

`/ownership-transfer?token=<single-use-token>`

An unauthenticated recipient is directed to the login workflow. The application preserves the intended ownership-transfer destination using a validated relative redirect.

After authenticating, the intended Admin can review the offer.

The review page identifies the initiating Owner, receiving account, expiration, and consequences of acceptance.

The introductory wording is neutral and remains grammatically correct regardless of administrator usernames.

Opening the email, opening the review link, or signing in does not automatically transfer ownership.

The recipient must explicitly select either **Accept Ownership** or **Decline**.

Another administrator cannot approve an offer intended for a different account.

## 5. Accepting ownership

When the intended receiving Admin selects **Accept Ownership**, the server revalidates:

- The authenticated receiving Admin's identity.
- The single-use transfer token.
- The pending request's status and expiration.
- The initiating account's current Owner role and active status.
- The recipient's current Admin role and active status.

A successful acceptance performs the role exchange atomically:

1. The previous Owner is demoted to Admin (role 2).
2. The recipient is promoted to Owner (role 1).
3. Both accounts' session versions are incremented.
4. The transfer request is marked accepted.

The SQLite transaction and database constraints prevent an incomplete committed role exchange.

The acceptance link cannot be used again.

Both affected administrators must sign in again because their existing sessions are invalidated.

The new Owner gains access to the Owner-only Admin page and its administrator-management functionality. The former Owner retains regular Admin access.

The application attempts to send completion notifications to both administrators. These notifications use neutral wording and explain the recipients' resulting permissions.

A notification-delivery failure does not reverse an already completed ownership exchange.

A completed transfer is not automatically reversible. Restoring the previous Owner requires a new, legitimate transfer initiated by the current Owner.

## 6. Declining ownership

The receiving Admin can select **Decline** instead of accepting.

A successful decline:

- Marks the request declined.
- Invalidates the acceptance link.
- Leaves both accounts' roles unchanged.
- Releases the pending-offer restriction.
- Attempts to notify the current Owner.

The decline notification uses neutral wording and explains that the current Owner and receiving Admin retain their existing roles.

The current Owner may initiate a new offer later.

## 7. Canceling a pending offer

Before acceptance, the current Owner can:

1. Open **Admin**.
2. Locate **Pending Ownership Transfer** below the Admins list.
3. Review the receiving Admin, pending status, and expiration.
4. Select **Cancel Transfer**.
5. Review the cancellation warning.
6. Select **Yes, Cancel Transfer**.

Cancellation marks the request canceled and invalidates the emailed link.

Neither account's role changes.

After cancellation, the Owner can select **Refresh Status** to verify the updated status. The entire Pending Ownership Transfer section disappears when no pending offer remains.

The **Refresh Status** and **Cancel Transfer** controls appear together. On narrow mobile layouts, they stack vertically using matching compact widths. On desktop, they appear side by side.

If cancellation cannot be confirmed because of a server or database error, the Owner must use **Refresh Status** and verify the actual pending state before attempting another transfer.

Pending-status lookup errors remain visible with a retry option. A failed lookup must not be treated as confirmation that no transfer exists.

An already accepted transfer cannot be canceled through the pending-offer interface.

## 8. Expiration, tokens, and request states

An ownership-transfer offer expires 24 hours after creation.

The token is generated from cryptographically secure random bytes. Only its SHA-256 hash is stored in the database.

The original token is not returned in the Owner-facing API response.

Supported request states are:

| Status | Meaning |
| --- | --- |
| pending | Awaiting the receiving Admin's explicit decision |
| accepted | Ownership successfully exchanged |
| declined | Receiving Admin rejected the offer |
| canceled | Initiating Owner revoked the pending offer |
| expired | Offer passed its expiration deadline |

Expired, accepted, declined, and canceled links cannot transfer ownership.

Expiration is enforced by timestamp validation even before cleanup updates the stored status. Expired pending records are cleaned up when the applicable transfer operations perform expiration cleanup.

Repeated requests and invalid token submissions must not result in a second Owner or an inconsistent database state.

## 9. Email delivery and troubleshooting

Transactional ownership-transfer emails use the application's email-delivery service.

Depending on environment configuration, delivery may use:

- Brevo transactional email.
- A locally configured Mailpit inbox.
- Development terminal output when neither delivery service is configured.

When `BREVO_SANDBOX=1`, Brevo can accept a test request without delivering an email. Sandbox submission must not be treated as successful inbox delivery.

If offer delivery fails after a request is created, the application attempts to cancel the undelivered offer.

If the cancellation result is uncertain, the Owner should refresh the pending status and explicitly cancel any remaining request before creating another offer.

An email being submitted to Brevo does not guarantee that Gmail will place it in the Inbox. Check Spam and Brevo transactional logs if a message appears missing.

Ownership notifications include:

- An invitation to the receiving Admin.
- A decline notification to the initiating Owner.
- Completion notifications to both affected accounts after acceptance.

These notifications use neutral language rather than inserting administrator usernames into grammatical sentences.

The invitation identifies the ownership offer, provides the single-use review link, explains the 24-hour expiration, and requires explicit acceptance or decline.

Decline and completion notifications describe the resulting roles and permissions.

Administrator password-setup invitations separately identify the appropriate Owner or Admin role and include the necessary setup instructions.

Never expose API keys, database proxy credentials, or unexpired acceptance links in public logs or documentation.

## 10. Owner-only administrator account editing

The Owner can update administrator usernames through the Owner-only Admin page.

This includes:

- Editing the Owner's own username.
- Editing the username of an existing Admin account.

To edit an account:

1. Sign in as the current Owner.
2. Open **Admin**.
3. Locate the account in the Owner or Admins section.
4. Open its three-dot menu.
5. Select **Edit Account**.
6. Modify the Username field.
7. Select **Save Changes** to save or **Cancel** to discard the edit.

The Edit Account dialog displays the account's role and email address for identification. Neither field can be changed through this dialog.

Username validation requires a nonempty username of no more than 40 characters. Leading and trailing whitespace is removed before saving.

The Save Changes action is unavailable when the username has not changed.

Successful updates are saved to D1 and reflected in the administrator list. The updated username persists after refreshing the page.

Canceling an edit does not modify the stored account.

The server independently enforces Owner-only authorization. Regular Admins and unauthenticated users cannot modify administrator usernames through direct API requests.

The editing API accepts only the username field. Account IDs, email addresses, roles, administrator permissions, passwords, and session versions are not modified by username editing.

Username editing does not replace or bypass the ownership-transfer workflow. Changing the current Owner requires a successful authorized transfer, not an account-details edit.

Email-address editing is not supported in this interface because changes to authentication and account-recovery identifiers require separate design and authorization.

## 11. Owner password recovery

If the Owner forgets their password but still controls the registered email address:

1. Open the TEAZO administrator login page.
2. Select **Set or reset password**.
3. Submit the registered Owner email address.
4. Check the Inbox and Spam folders for the password-reset message.
5. Open the single-use reset link.
6. Complete the password change.
7. Sign in with the updated password.

For an existing account with a password, the password-reset link expires after 30 minutes.

Newly invited accounts without a password use the setup flow, whose link expires after 24 hours.

Where supported and properly configured for the registered account, Google SSO remains an alternative sign-in method.

Password recovery does not transfer ownership and does not authorize another Admin to become Owner.

If email delivery fails, check application configuration and transactional logs rather than manually promoting another account.

## 12. Loss of all Owner recovery access

If the current Owner has lost both:

- All usable login credentials or supported sign-in access.
- Access to the account's registered recovery email.

Then the standard self-service recovery workflow is unavailable.

The application does not currently provide:

- Multiple concurrent Owners.
- An emergency Owner override.
- An automatic recovery Owner.
- A self-service administrator promotion workaround.
- An implemented break-glass ownership-recovery feature.

Restoring access in this situation requires a separately designed and authorized operational recovery procedure, including appropriate identity and ownership verification.

That procedure is outside the scope of the ownership-transfer feature.

Operators must not treat arbitrary direct database role changes as an approved recovery process.

## 13. Database and deployment considerations

Relevant migrations include:

- `0010_admin_roles.sql` — establishes the simplified Owner/Admin role system.
- `0011_ownership_transfer.sql` — adds ownership-transfer requests, indexes, constraints, and transfer triggers.

The ownership-transfer implementation uses:

- The `admin_user` table for administrator roles and session versions.
- The `ownership_transfer_request` table for request status, parties, token hashes, and timestamps.
- A single-Owner uniqueness constraint.
- A single-pending-transfer constraint.
- Database triggers that enforce status transitions and atomic acceptance.

Migration `0011` must be applied only after the prerequisite administrator-role schema has been established.

Before production deployment:

1. Review the intended migration sequence.
2. Back up production D1 according to the team's approved database procedures.
3. Confirm the current production administrator data and the single-Owner invariant.
4. Apply migrations through the approved Cloudflare D1 deployment process.
5. Verify the migration completed and the Owner account remains active.
6. Confirm the application's D1 proxy configuration and permissions.
7. Confirm Brevo configuration and sender verification.
8. Confirm `NEXT_PUBLIC_BASE_URL` resolves to the intended HTTPS website origin.
9. Ensure `BREVO_SANDBOX` is not enabled when real emails must be delivered.
10. Review application dependency security advisories and coordinate required security updates before deployment.
11. Deploy the application changes only after the required schema is available.
12. Verify authentication, transfer creation, notifications, account editing, and authorization after deployment.

Relevant environment configuration includes:

- `D1_PROXY_URL` and `PROXY_TOKEN` for the application's database proxy.
- `BREVO_API_KEY`, `EMAIL_FROM`, and `EMAIL_FROM_NAME` for transactional email.
- `NEXT_PUBLIC_BASE_URL` for application links.

Secrets must remain server-side and must not be committed to the repository.

The local development migration command used by this project is:

`npm run db:migrate:local`

Run that from the `teazo-d1-proxy` project directory, not from `teazo-site`.

This local command does not constitute production migration approval. Follow the team's documented remote-migration process for deployment.

Do not reset, replace, or overwrite the production D1 database during routine feature testing.

## 14. Operational verification

After migration or a significant administrator-management or ownership-transfer change, verify:

- There is exactly one active, non-deleted Owner.
- Regular Admins cannot manage or edit administrator accounts.
- Only the Owner can access the Owner-only Admin page.
- The `/admin` Dashboard remains available.
- The Owner and Admins sections display the correct accounts.
- The Owner can edit their own username and existing Admin usernames.
- Username edits persist without changing account IDs, roles, or permissions.
- An Owner can initiate an offer only for an eligible active Admin.
- The pending-offer status and expiration are displayed.
- Pending-transfer controls work on desktop and mobile.
- Pending-status lookup failures display an error and retry option.
- Cancellation invalidates the previous link and removes the pending section after status verification.
- Decline invalidates the link without changing roles.
- Acceptance exchanges roles and invalidates both existing sessions.
- Completed links cannot be reused.
- The new Owner can access the Owner-only Admin page.
- The former Owner can access authorized content but not administrator management.
- Both completion notifications are submitted and their delivery outcomes can be checked.
- Invitation, decline, and completion messages use neutral wording.
- Password and Google authentication continue to work.

Use a dedicated local D1 environment and accounts controlled by the testers. Do not run ownership-exchange tests against production accounts without explicit authorization.

Relevant automated test files include:

- `app/lib/ownership-transfer.test.ts`
- `app/lib/ownership-transfer-sql.test.ts`
- `app/lib/ownership-transfer-concurrency.test.ts`
- `app/lib/ownership-transfer-email.test.ts`
- `app/lib/admin-password-email.test.ts`
- `app/api/admin/ownership-transfer/route.test.ts`
- `app/api/admin/ownership-transfer/decision/route.test.ts`
- `app/ownership-transfer/ownership-transfer-client.test.tsx`
- `app/admin/settings/components/admin-table.test.tsx`
- `app/admin/settings/components/transfer-ownership-dialog.test.tsx`
- `app/api/admin/settings/admins/[id]/route.test.ts`
- `app/lib/queries/settings.test.ts`

Run the project test suite using:

`npm test`

Also run TypeScript, feature-specific ESLint checks, and the production build before submitting a PR.

The parent administrator-role simplification task additionally requires repository-wide ESLint and final integration/regression verification.

## 15. Current limitations

The current implementation is intentionally limited to a single Owner and authenticated, Owner-initiated transfers to existing active Admin accounts.

The Owner-only Edit Account feature supports username changes only. Email-address editing, account role editing, and changing administrator-management permissions are not supported through this feature.

There is no automatic ownership-transfer reversal or self-service emergency Owner recovery.

Those capabilities require separately scoped design, authorization, implementation, and testing.
