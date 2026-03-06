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
