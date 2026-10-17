
# TEAZO — Brevo Email Monitoring and Maintenance

## 1. Overview

The TEAZO website uses Brevo to send email notifications when visitors submit the public contact form.

The system also includes an automated Brevo API-key activity check and Healthchecks.io monitoring to detect failures and help prevent API-key deactivation due to inactivity.

This document describes the production configuration, monitoring procedures, troubleshooting steps, and responsibilities for maintaining the integration.

## 2. System Architecture

### Contact Form

The production contact-form workflow is:

1. A visitor completes the contact form at https://teazous.com/contact.
2. Cloudflare Turnstile verifies the submission.
3. The application validates the submitted information.
4. The message is saved in the production Cloudflare D1 database.
5. The application sends an email notification through Brevo.
6. The notification is delivered to the configured recipient.

The email includes the visitor's information and uses the visitor's email address as the Reply-To address.

The database record provides a backup of the submission if email delivery fails.

### Automated Brevo Activity Check

The Brevo health-check workflow is:

1. Vercel invokes `/api/cron/brevo-health` according to the configured schedule.
2. The endpoint validates the request using `CRON_SECRET`.
3. The endpoint makes an authenticated `GET` request to `https://api.brevo.com/v3/account`.
4. The application checks whether Brevo accepts the API key.
5. The endpoint reports success or failure to Healthchecks.io.
6. Healthchecks.io monitors the expected execution schedule and sends email alerts when necessary.

The activity check does not send transactional emails.

### Analytics Cleanup

The application also includes `/api/cron/cleanup-analytics`.

This endpoint runs daily to remove outdated analytics data and uses the same `CRON_SECRET` authentication mechanism.

The analytics cleanup and Brevo activity check are separate operations.

## 3. Production Environment Variables

The following environment variables are used by the integration.

| Variable | Purpose |
|---|---|
| `BREVO_API_KEY` | Authenticates requests to the Brevo API. |
| `EMAIL_FROM` | Configures the sender email address. |
| `EMAIL_FROM_NAME` | Configures the sender display name. |
| `CONTACT_NOTIFY_TO` | Specifies the contact-form notification recipient. |
| `CRON_SECRET` | Authenticates scheduled endpoint requests. |
| `BREVO_HEALTHCHECK_URL` | Identifies the Healthchecks.io check receiving monitoring pings. |

These values are managed through the Vercel project's Production environment settings.

The API key, Cron secret, and monitoring URL must be treated as sensitive credentials.

Never commit credentials to GitHub, include them in documentation, or expose them in application logs.

Changes to production environment variables may require a new Vercel deployment before they take effect.

## 4. Vercel Cron Jobs

Scheduled jobs are configured in:

`teazo-site/vercel.json`

### Initial Testing Schedule

During deployment verification, both jobs use:

`0 0 * * *`

This executes once daily at 00:00 UTC.

| Endpoint | Initial Schedule |
|---|---|
| `/api/cron/brevo-health` | Daily |
| `/api/cron/cleanup-analytics` | Daily |

### Long-Term Schedule

After successful production verification, change the Brevo health-check schedule to:

`0 0 1 * *`

This executes on the first day of every month at 00:00 UTC.

The analytics cleanup job should remain scheduled daily.

The Healthchecks.io schedule must also be updated to match the monthly Brevo schedule.

## 5. Healthchecks.io Monitoring

Monitoring is managed through:

https://healthchecks.io

The monitoring account uses the team's shared email address:

`teazodevcsus@gmail.com`

### Monitoring Check

Name: Teazo Brevo API Health

Tags: teazo, brevo, production

Initial schedule: `0 0 * * *`

Time zone: UTC

Grace time: 2 hours

Notification recipient: `teazodevcsus@gmail.com`

### Monitoring Behavior

A successful Brevo API request sends a success ping to Healthchecks.io.

A failed Brevo API request sends a failure ping.

If the scheduled job does not execute within the expected schedule and grace period, Healthchecks.io marks the check as down and sends an alert.

If Healthchecks.io is temporarily unavailable, the application logs the monitoring failure without changing the Brevo API-check result.

### Notification Testing

The Healthchecks.io email integration can be tested from the Integrations page.

The integration should deliver a test notification to the shared Gmail account.

A successful notification test confirms the alert delivery mechanism, but it does not verify the Brevo API or the Vercel Cron Job.

## 6. Monitoring and Troubleshooting

### Check Vercel Execution

1. Open the TEAZO project in Vercel.
2. Review the Production deployment.
3. Locate the Cron Jobs configuration and execution logs.
4. Check for requests to `/api/cron/brevo-health`.
5. Confirm the endpoint completes successfully.
6. Investigate non-200 responses and relevant server-side error logs.

The endpoint returns HTTP 200 when the Brevo API request succeeds.

It returns HTTP 401 for unauthorized requests and HTTP 503 when the Brevo health check fails or is not configured.

### Check Healthchecks.io

1. Sign in to Healthchecks.io.
2. Open Teazo Brevo API Health.
3. Review the latest ping and event history.
4. Confirm successful pings are received after scheduled executions.
5. Investigate any failure or missed-run alerts.

### Brevo API-Key Failure

If Brevo rejects the API key:

1. Check Vercel runtime logs for the Brevo health-check failure.
2. Confirm the API key is still active in Brevo.
3. Verify the correct key is configured in Vercel Production.
4. If necessary, generate a replacement API key in Brevo.
5. Securely update `BREVO_API_KEY` in Vercel.
6. Redeploy the application if required.
7. Verify the health-check endpoint succeeds.
8. Submit a test contact-form message and confirm email delivery.

Never share the API key in Discord, GitHub, or ordinary documentation.

### Missing Cron Execution

If Healthchecks.io reports a missed execution:

1. Check whether the Vercel deployment is healthy.
2. Verify that `vercel.json` contains the correct Cron Job.
3. Confirm the configured schedule matches Healthchecks.io.
4. Check whether `CRON_SECRET` exists in Vercel Production.
5. Review Vercel runtime logs for execution errors.
6. Verify the endpoint is deployed and accessible through its scheduled invocation.

### Monitoring URL Failure

If the Brevo API request succeeds but Healthchecks.io does not receive a ping:

1. Confirm `BREVO_HEALTHCHECK_URL` exists in Vercel Production.
2. Verify it contains the current Healthchecks.io ping URL.
3. Check the Vercel logs for monitoring failures.
4. Confirm the Healthchecks.io check has not been deleted or replaced.
5. Redeploy if environment variables were changed.
6. Verify a new ping appears in Healthchecks.io.

If the monitoring URL is exposed, replace the Healthchecks.io check and update the environment variable securely.

## 7. Production Verification Checklist

Before considering the monitoring integration fully deployed, verify:

- [ ] `CRON_SECRET` is configured in Vercel Production.
- [ ] `BREVO_HEALTHCHECK_URL` is configured securely.
- [ ] The Brevo Cron Job appears in the Production deployment.
- [ ] The Brevo Cron Job executes successfully.
- [ ] Healthchecks.io receives a successful ping.
- [ ] A simulated Brevo failure produces a failure notification.
- [ ] A missed scheduled execution produces an alert.
- [ ] The analytics cleanup Cron Job executes successfully.
- [ ] The Brevo schedule is changed from daily to monthly after testing.
- [ ] Healthchecks.io is updated to match the monthly schedule.

## 8. Client Handoff and Maintenance

The TEAZO site owners or designated technical administrator should retain access to:

- The Brevo account used for transactional email.
- The Vercel project hosting the website.
- The Healthchecks.io monitoring account.
- The shared Gmail account receiving notifications.
- The domain's DNS management account.

### Routine Maintenance

Periodically:

1. Review Healthchecks.io for missed or failed checks.
2. Confirm contact-form notifications continue to arrive.
3. Review Brevo API-key status and activity.
4. Investigate any Vercel Cron Job failures.
5. Keep the configured notification recipient current.
6. Rotate credentials when required or if compromised.

### Handling Alerts

When a monitoring alert arrives:

1. Identify whether the issue concerns Brevo, Vercel, or Healthchecks.io.
2. Review the relevant application logs.
3. Correct the underlying configuration or service issue.
4. Verify successful execution afterward.
5. Confirm Healthchecks.io returns to a healthy state.

Do not dismiss alerts without verifying the underlying issue.

### Credential Management

All production credentials should be managed securely.

Use Vercel environment variables for application secrets.

Use an approved secure sharing mechanism, such as Bitwarden Send, when credentials must be transferred between authorized administrators.

Never store production secrets in source code.

## 9. Related Files

| File | Purpose |
|---|---|
| `teazo-site/app/lib/email.ts` | Brevo transactional email integration. |
| `teazo-site/app/api/cron/brevo-health/route.ts` | Brevo API activity check and monitoring integration. |
| `teazo-site/app/api/cron/brevo-health/route.test.ts` | Automated health-check tests. |
| `teazo-site/app/api/cron/cleanup-analytics/route.ts` | Scheduled analytics cleanup endpoint. |
| `teazo-site/vercel.json` | Vercel Cron Job schedules. |

## 10. Related Jira Tasks

- TZ-428 — Configure Brevo Transactional Email
- TZ-429 — Configure Brevo Environment Variables in Vercel
- TZ-430 — Test Contact Form Email Delivery
- TZ-431 — Implement Automated Brevo API-Key Activity Checks
- TZ-432 — Implement Brevo Monitoring and Client Handoff Documentation
- TZ-433 — Authenticate Teazo Domain for Brevo Email Delivery

This document should be reviewed whenever the email integration, monitoring service, scheduled jobs, or production configuration changes.
