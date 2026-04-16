---
name: landing
description: Onboarding and platform initialization module ("The Link").
---

# Landing Module

The Landing module manages the initial user experience, including onboarding, vault creation, and system boot procedures.

## Domain
Focuses on user acquisition, platform setup, and the initialization of the E2EE environment.

## Key Components
- **The Link**: Secure connection between the user and the Ara backend.
- **Onboarding Flow**: Sequential data intake for Agnes, Atlas, and Titan.
- **System Initialization**: Bootloader logic for establishing the Spine and Vault contexts.

## Data Structures (NSV)
- **Initialization Status**: Tracking of setup progress (Vault, Auth, Core Modules).
- **User Intent Profile**: Initial goals and motivations captured during intake.

## AI Action Tags
- `initialize_platform(user_id: string)`: Begins the system setup and Vault generation process.
- `complete_onboarding_step(step_id: string, data: object)`: Records progress in the initialization flow.
- `trigger_vault_gate(password: string)`: Authorizes the local decryption of the system Vault.
