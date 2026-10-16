"""Initial workspace-scoped records and durable events.

Existing unversioned prototype tables are adopted only with the expected columns.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    expected = {
        "ara_entities": {"id", "kind", "workspace_id", "data", "revision", "created_at", "updated_at"},
        "ara_events": {"sequence", "entity_id", "type", "data", "created_at"},
    }
    for table, columns in expected.items():
        if inspector.has_table(table) and {c["name"] for c in inspector.get_columns(table)} != columns:
            raise RuntimeError("Unexpected prototype schema; preserve the database and migrate explicitly.")
    if not inspector.has_table("ara_entities"):
        op.create_table("ara_entities",
            sa.Column("id", sa.String(120), primary_key=True),
            sa.Column("kind", sa.String(40), nullable=False, index=True),
            sa.Column("workspace_id", sa.String(80), nullable=False, index=True),
            sa.Column("data", JSONB, nullable=False),
            sa.Column("revision", sa.Integer, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    if not inspector.has_table("ara_events"):
        op.create_table("ara_events",
            sa.Column("sequence", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("entity_id", sa.String(120), nullable=False, index=True),
            sa.Column("type", sa.String(100), nullable=False),
            sa.Column("data", JSONB, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    raise RuntimeError("Destructive downgrade is unsupported. Restore a verified recovery bundle instead.")
