---
name: hub
description: Central orchestration hub and dashboard for the Nexus ecosystem.
---

# Hub Module

The Hub is the navigational and visualization center of Nexus, synthesizing data from all modules into a unified interactive experience.

## Features
- **3D Visualization**: Interactive Three.js representation of the user's state (Agnes/Atlas/Titan models).
- **Knowledge Graph**: Real-time rendering of linked concepts and module dependencies.
- **Card-Based View**: Tactical overview of tasks, vitals, and emotional status.

## Wellness Gauges (NSV Synthesis)
- **Stability**: Measures the variance and consistency across biological and financial metrics.
- **Resilience**: Holistic score of the user's capacity to handle stress and adapt to change.
- **System Harmony**: Quantifies the alignment between different modules (e.g., Physical goals matching Resource constraints).

## AI Action Tags
- `navigate_to(view: string)`: Updates the UI state to focus on a specific module or visualization.
- `refresh_dashboard_metrics()`: Triggers a global re-fetch and re-computation of high-level gauges.
- `trigger_global_sync()`: Synchronizes all modules with the latest Spine events and Vault data.
