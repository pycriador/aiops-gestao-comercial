"""IAM permission catalog and evaluation."""

from __future__ import annotations

from sqlalchemy import select

from app.extensions import db
from app.models import IamRole, UserRole

PERMISSION_CATALOG: dict[str, str] = {
  "portfolio.read": "Visualizar carteira de imobiliárias",
  "portfolio.write": "Criar e editar imobiliárias",
  "portfolio.delete": "Excluir imobiliárias",
  "consultants.read": "Visualizar consultores",
  "consultants.manage": "Gerenciar consultores",
  "users.manage": "Gerenciar usuários",
  "roles.manage": "Gerenciar papéis e permissões",
  "import.run": "Importar planilhas",
  "settings.hubspot": "Configurar HubSpot",
  "settings.slack": "Configurar Slack",
  "bot.view": "Visualizar bot WhatsApp/Slack",
}

DEFAULT_ROLES: list[dict] = [
  {
    "slug": "admin",
    "name": "Administrador",
    "description": "Acesso total à plataforma",
    "is_system": True,
    "data_scope": "all",
    "permissions": ["*"],
  },
  {
    "slug": "manager",
    "name": "Gestor",
    "description": "Visão completa da carteira e configurações operacionais",
    "is_system": True,
    "data_scope": "all",
    "permissions": [
      "portfolio.read",
      "portfolio.write",
      "portfolio.delete",
      "consultants.read",
      "settings.hubspot",
      "settings.slack",
      "bot.view",
    ],
  },
  {
    "slug": "consultant",
    "name": "Consultor",
    "description": "Acesso apenas às imobiliárias vinculadas ao seu perfil",
    "is_system": True,
    "data_scope": "own",
    "permissions": ["portfolio.read", "portfolio.write"],
  },
]


def ensure_default_roles() -> None:
  for spec in DEFAULT_ROLES:
    existing = db.session.get(IamRole, spec["slug"])
    if existing:
      continue
    db.session.add(IamRole(**spec))
  db.session.commit()


def role_slugs_for_user(user_id: str | None) -> set[str]:
  if not user_id:
    return set()
  rows = db.session.scalars(select(UserRole.role).where(UserRole.user_id == user_id)).all()
  return set(rows)


def permissions_for_user(user_id: str | None) -> set[str]:
  if not user_id:
    return set()
  effective: set[str] = set()
  for slug in role_slugs_for_user(user_id):
    role = db.session.get(IamRole, slug)
    if not role:
      continue
    perms = role.permissions or []
    if "*" in perms:
      return set(PERMISSION_CATALOG.keys())
    effective.update(perms)
  return effective


def has_permission(user_id: str | None, permission: str) -> bool:
  return permission in permissions_for_user(user_id)


def data_scope_for_user(user_id: str | None) -> str:
  if not user_id:
    return "own"
  for slug in role_slugs_for_user(user_id):
    role = db.session.get(IamRole, slug)
    if role and role.data_scope == "all":
      return "all"
  return "own"


def can_manage_users(user_id: str | None, service_role: bool = False) -> bool:
  return service_role or has_permission(user_id, "users.manage")


def can_manage_roles(user_id: str | None, service_role: bool = False) -> bool:
  return service_role or has_permission(user_id, "roles.manage")
