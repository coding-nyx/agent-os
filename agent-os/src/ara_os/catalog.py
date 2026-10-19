from .preset_specs import PRESETS


MODULES = [
    {"id": "finance", "name": "Finance", "icon": "wallet", "description": "Accounts, transactions and a clear view of your money.", "surface": "finance.workspace", "offline_policy": "cached_reads_and_drafts"},
    {"id": "training", "name": "Training", "icon": "activity", "description": "Programs, workouts and progress you can build on.", "surface": "training.workspace", "offline_policy": "cached_reads_and_drafts"},
    {"id": "notebook", "name": "Private notebook", "icon": "notebook", "description": "A private space for notes and reflection.", "surface": "notebook.workspace", "offline_policy": "cached_reads_and_drafts"},
    {"id": "research", "name": "Research", "icon": "compass", "description": "Sources, evidence and findings. Advanced Scout views come later.", "surface": "research.workspace", "offline_policy": "cached_reads_and_drafts"},
    {"id": "custom", "name": "Custom data", "icon": "database", "description": "Your schema, records and configured agent access.", "surface": "records.table", "offline_policy": "cached_reads_and_drafts"},
    {"id": "emotional", "name": "Reflection journal", "icon": "heart", "description": "Private check-ins and reflections, shared with Agnes only when you bind them.", "surface": "reflection.workspace", "offline_policy": "cached_reads_and_drafts"},
    {"id": "planning", "name": "Plans & tasks", "icon": "checklist", "description": "Goals, priorities, and manageable next steps with Atlas.", "surface": "planning.workspace", "offline_policy": "cached_reads_and_drafts"},
]
