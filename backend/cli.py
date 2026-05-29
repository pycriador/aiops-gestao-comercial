#!/usr/bin/env python3
"""CLI for Agency Watch backend administration."""

from __future__ import annotations

from pathlib import Path

import click
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR / ".env"

# Always load backend/.env (not cwd-dependent)
load_dotenv(ENV_FILE)


def _db_label() -> str:
  from app.config import build_database_url

  url = build_database_url()
  return url.split("@")[-1] if "@" in url else url


def _cli_app():
  from app import create_app

  return create_app(init_db=False)


@click.group()
def cli():
  """Agency Watch backend CLI — uses PostgreSQL settings from backend/.env"""


@cli.command("list-users")
def list_users():
  """List registered users (email + id)."""
  from app.extensions import db
  from app.models import AuthUser, UserRole

  app = _cli_app()
  with app.app_context():
    click.echo(f"Database: {_db_label()}")
    users = db.session.query(AuthUser).order_by(AuthUser.email).all()
    if not users:
      click.echo("No users found.")
      return
    for u in users:
      roles = [r.role for r in UserRole.query.filter_by(user_id=u.id).all()]
      click.echo(f"  {u.email}  id={u.id}  roles={','.join(roles) or '—'}")


@cli.command("create-user")
@click.option("--email", prompt=True)
@click.option("--password", default=None, help="If omitted, prompts interactively")
@click.option("--role", type=click.Choice(["admin", "manager", "consultant"]), default="admin")
@click.option("--name", default=None, help="Consultant display name (optional)")
def create_user(email: str, password: str | None, role: str, name: str | None):
  """Create a user with password and role."""
  if password is None:
    password = click.prompt("Password", hide_input=True, confirmation_prompt=True)

  from app.auth.security import hash_password
  from app.extensions import db
  from app.models import AuthUser, Consultant, UserRole, utcnow

  app = _cli_app()
  with app.app_context():
    click.echo(f"Database: {_db_label()}")
    email = email.strip().lower()
    if AuthUser.query.filter_by(email=email).first():
      raise click.ClickException(f"User already exists: {email}")

    user = AuthUser(
      email=email,
      encrypted_password=hash_password(password),
      email_confirmed_at=utcnow(),
    )
    db.session.add(user)
    db.session.flush()
    db.session.add(UserRole(user_id=user.id, role=role))

    if name:
      db.session.add(Consultant(user_id=user.id, name=name, email=email, active=True))

    db.session.commit()
    click.echo(f"Created user {email} with role '{role}' (id={user.id})")


@cli.command("reset-password")
@click.option("--email", prompt=True)
@click.option("--password", default=None, help="If omitted, prompts interactively")
def reset_password(email: str, password: str | None):
  """Reset password for an existing user and revoke active sessions."""
  if password is None:
    password = click.prompt("New password", hide_input=True, confirmation_prompt=True)

  from app.auth.security import hash_password, verify_password
  from app.extensions import db
  from app.models import AuthUser, RefreshToken, utcnow

  app = _cli_app()
  with app.app_context():
    click.echo(f"Database: {_db_label()}")
    email = email.strip().lower()
    user = AuthUser.query.filter_by(email=email).first()
    if not user:
      raise click.ClickException(
        f"User not found: {email}\n"
        f"Run: python cli.py list-users"
      )

    user.encrypted_password = hash_password(password)
    user.updated_at = utcnow()
    db.session.flush()

    revoked = (
      RefreshToken.query.filter_by(user_id=user.id, revoked_at=None)
      .update({"revoked_at": utcnow()}, synchronize_session=False)
    )
    db.session.commit()

    if not verify_password(password, user.encrypted_password):
      raise click.ClickException("Password was saved but verification failed — check database connection.")

    click.echo(f"Password reset for {email} (id={user.id}). Revoked {revoked} session(s).")


@cli.command("init-iam")
def init_iam():
  """Create IAM tables, seed default roles, and relax user_roles constraint."""
  from sqlalchemy import text

  from app.auth.permissions import ensure_default_roles
  from app.extensions import db

  app = _cli_app()
  with app.app_context():
    click.echo(f"Database: {_db_label()}")
    db.create_all()
    ensure_default_roles()
    db.session.execute(text("ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check"))
    db.session.commit()
    click.echo("IAM initialized: iam_roles table, default roles, user_roles constraint updated.")


@cli.command("init-db")
def init_db():
  """Create all database tables."""
  from app import create_app

  app = create_app(init_db=True)
  with app.app_context():
    click.echo(f"Database initialized: {_db_label()}")


@cli.command("seed")
def seed():
  """Load sample portfolio data."""
  from app.extensions import db
  from app.models import Consultant, RealEstateAgency

  app = _cli_app()
  with app.app_context():
    click.echo(f"Database: {_db_label()}")
    if RealEstateAgency.query.count() > 0:
      click.echo("Database already has agencies — skipping seed.")
      return

    c1 = Consultant(name="Ana Consultora", email="ana@loft.com", phone="5511999000001", regional="SP", active=True)
    c2 = Consultant(name="Bruno Gestor", email="bruno@loft.com", phone="5511999000002", regional="RJ", active=True)
    db.session.add_all([c1, c2])
    db.session.flush()

    agencies = [
      RealEstateAgency(name="Imobiliária Alpha", city="São Paulo", state="SP", consultant_id=c1.id, contract_stock=120, negotiation_status="Em negociação", next_steps="Enviar proposta revisada"),
      RealEstateAgency(name="Imobiliária Beta", city="Rio de Janeiro", state="RJ", consultant_id=c2.id, contract_stock=80, negotiation_status="Reunião agendada", c_level_support_needed=True),
      RealEstateAgency(name="Imobiliária Gamma", city="Curitiba", state="PR", consultant_id=c1.id, contract_stock=45, negotiation_status="Pipeline de Prospecção"),
    ]
    db.session.add_all(agencies)
    db.session.commit()
    click.echo(f"Seeded {len(agencies)} agencies and 2 consultants.")


@cli.command("import-exemplos")
@click.option(
  "--dir",
  "data_dir",
  type=click.Path(exists=True, file_okay=False, path_type=Path),
  default=str(BACKEND_DIR.parent / "exemplos"),
  show_default=True,
  help="Folder with CSV exports",
)
@click.option("--replace", is_flag=True, help="Clear portfolio tables before import")
def import_exemplos_cmd(data_dir: Path, replace: bool):
  """Import portfolio data from exemplos/*.csv exports."""
  from app.importers.exemplos import import_exemplos

  app = _cli_app()
  with app.app_context():
    click.echo(f"Database: {_db_label()}")
    click.echo(f"Importing from: {data_dir}")
    try:
      counts = import_exemplos(data_dir, replace=replace)
    except RuntimeError as exc:
      raise click.ClickException(str(exc)) from exc

    click.echo(
      "Imported: "
      f"{counts['consultants']} consultants, "
      f"{counts['agencies']} agencies, "
      f"{counts['interactions']} interactions, "
      f"{counts['slack_events']} slack events"
      + (f", {counts['user_roles']} user roles" if counts["user_roles"] else "")
    )


if __name__ == "__main__":
  cli()
