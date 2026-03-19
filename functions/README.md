# Cloud Functions

## Build + Deploy

```
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only functions
```

## Required Environment

Set the Tavily key for `scoutWebSearch`:

```
firebase functions:secrets:set TAVILY_API_KEY
```

Then deploy. For local emulators, set `TAVILY_API_KEY` in your shell before starting.

## Reminders (scheduleReminder / deliverReminder)

These functions use **Cloud Tasks** to schedule reminder delivery. You must create the queue once per project/region.

**One-time setup (same project as Firebase):**

1. **Enable the Cloud Tasks API** (required or the function gets "queue not found"):
   ```bash
   gcloud services enable cloudtasks.googleapis.com --project=PROJECT_ID
   ```

2. **Create the queue** (region `us-central1`, queue name `reminder-delivery`):
   ```bash
   gcloud tasks queues create reminder-delivery \
     --project=PROJECT_ID \
     --location=us-central1
   ```

3. **Grant the function permission to enqueue** (replace `PROJECT_ID`):
   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
     --role="roles/cloudtasks.enqueuer"
   ```

**OIDC identity:** The task uses the **runtime service account** (compute default) to invoke `deliverReminder`; the code resolves it via the metadata server. If you see "Requested entity was not found" when creating tasks, your project may not have an App Engine default SA; the function now uses the compute SA automatically. To override, set `TASKS_OIDC_SERVICE_ACCOUNT` (e.g. `825823603353-compute@developer.gserviceaccount.com`) when deploying.

If you use a different region or queue name, set these when deploying:

- `TASKS_LOCATION` — e.g. `europe-west1`
- `TASKS_QUEUE` — e.g. `reminder-delivery`
- `TASKS_TARGET_URL` — (optional) full URL of `deliverReminder` if it’s in another region

No secrets are required for reminder tasks; the default App Engine service account can create tasks.

**If you still see "Reminder queue not found" after creating the queue:**

1. **Confirm the queue exists in the same project and region** the function uses. In the app console, expand the error `details` object — it shows the exact `queue` path (e.g. `projects/agent-agnes-ai/locations/us-central1/queues/reminder-delivery`).

2. **List queues** in that project/region:
   ```bash
   gcloud tasks queues list --project=YOUR_PROJECT_ID --location=us-central1
   ```
   The queue name must be exactly `reminder-delivery` and the location must match (default is `us-central1`). If you created the queue in another region, set the function config when deploying:
   ```bash
   firebase deploy --only functions --set-env-vars TASKS_LOCATION=YOUR_REGION
   ```

3. **Confirm the project** — Use the same project ID as your Firebase project (e.g. `agent-agnes-ai`). If you created the queue in a different GCP project, create it again in the Firebase project.
